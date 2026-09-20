/**
 * Line-for-line port of apps/backend/app/services/analyzer.py's DriftAnalyzer.
 * All classification thresholds and control-flow order are preserved exactly
 * (see config.ts for the numeric constants). Output objects use the same
 * snake_case field names as packages/shared-types so downstream UI components
 * (TrailMap.tsx, InspectorPanel.tsx) need no changes.
 */
import type {
  AnalysisMode,
  AnalysisRequest,
  AnalysisResponse,
  AnalysisSummary,
  Classification,
  ClassificationProbabilities,
  ConversationTurn,
  DecisionSource,
  EdgeRelationship,
  NodeType,
  PathType,
  TrailEdge,
  TurnAnalysis,
  TurnUiMeta,
} from '@rabbithole/shared-types';
import type { AnalysisConfig } from './config';
import { DEFAULT_CONFIG } from './config';
import { agglomerativeClusterLabels } from './clustering';
import { detectChangePoints } from './changepoints';
import { buildAnalysisText, contextualizePromptText, heuristicFocusSummary, normalizeText } from './focus';
import { cosineSimilarity, keywordOverlap, meanCentroid, mergeKeywordSets, TrackedLineage } from './lineages';
import { buildRootTopicLabel, buildTopicLabels } from './tfidf';
import type { EmbeddingProvider } from './embeddings';

const MAIN_PATH_CLASSES = new Set<Classification>(['ON_PATH', 'DEEPENING', 'RETURN_TO_PATH']);

const KEYWORD_PATTERN = /[A-Za-z][A-Za-z0-9+-]{2,}/g;
const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'your', 'what', 'when',
  'where', 'have', 'just', 'into', 'them', 'then', 'they', 'like', 'will', 'would',
  'there', 'also', 'about', 'need', 'does', 'how', 'can', 'you', 'are', 'not',
  'but', 'its', 'it', 'was', 'out', 'all', 'any',
]);

interface PreparedTurn {
  promptText: string;
  responseText: string;
  responseFocusText: string;
  analysisText: string;
  topicText: string;
}

interface BranchSignal {
  similarity: number;
  score: number;
  anchor: number;
  keywordOverlap: number;
  lineageId: number | null;
}

interface TurnTraversalMeta {
  lineageId: number | null;
  forkTurnId: number | null;
  anchorTurnId: number | null;
}

// --- Probabilistic (LLM) overlay contract -------------------------------------

export interface ProbabilisticTurnInput {
  id: number;
  promptText: string;
  responseFocusText: string;
  prevSimilarity: number;
  localSimilarity: number;
  rootSimilarity: number;
  mainlineSimilarity: number;
  branchSimilarity: number;
  lineageAnchorScore: number;
  driftScore: number;
  localCoherenceScore: number;
}

export interface ProbabilisticTurnDecision {
  id: number;
  topicLabel: string;
  classification: Classification;
  explanation: string;
  probabilities: ClassificationProbabilities;
}

export interface ProbabilisticConversationDecision {
  rootTopicLabel: string;
  turns: ProbabilisticTurnDecision[];
}

export interface ModelAssistService {
  readonly available: boolean;
  summarizeResponse(promptText: string, responseText: string, mode: AnalysisMode): Promise<string>;
  classifyConversation(
    rootTopicLabel: string,
    turns: ProbabilisticTurnInput[],
  ): Promise<ProbabilisticConversationDecision | null>;
}

/** Used when no LLM endpoint is configured -- mirrors model_assist.py's unavailable path. */
export class NoopModelAssistService implements ModelAssistService {
  readonly available = false;

  constructor(private readonly config: AnalysisConfig) {}

  async summarizeResponse(promptText: string, responseText: string): Promise<string> {
    return heuristicFocusSummary(promptText, responseText, this.config);
  }

  async classifyConversation(): Promise<ProbabilisticConversationDecision | null> {
    return null;
  }
}

// --- Small numeric/text helpers -------------------------------------------------

function clamp(value: number, minimum = 0.0, maximum = 1.0): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function keywordSet(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.matchAll(KEYWORD_PATTERN)) {
    const token = match[0].toLowerCase();
    if (!STOPWORDS.has(token)) tokens.add(token);
  }
  return tokens;
}

function boostSimilarity(similarity: number, overlap: number, weight: number): number {
  if (overlap <= 0) return similarity;
  return clamp(similarity + overlap * weight);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function selectBestBranchSignal(options: {
  lineages: TrackedLineage[];
  turnIndex: number;
  embedding: number[];
  keywords: Set<string>;
  rootCentroid: number[];
  mainlineCentroid: number[];
  rootKeywords: Set<string>;
  mainlineKeywords: Set<string>;
  config: AnalysisConfig;
}): BranchSignal {
  const { lineages, turnIndex, embedding, keywords, rootCentroid, mainlineCentroid, rootKeywords, mainlineKeywords, config } =
    options;
  let best: BranchSignal = { similarity: 0, score: 0, anchor: 0, keywordOverlap: 0, lineageId: null };
  if (lineages.length === 0) return best;

  const fallbackCentroid = mainlineCentroid.length > 0 ? mainlineCentroid : rootCentroid;

  for (const lineage of lineages) {
    const match = lineage.match({ turnIndex, embedding, keywords, fallbackCentroid, config });
    const anchor = lineage.anchorScore({ rootCentroid, mainlineCentroid, rootKeywords, mainlineKeywords });
    const signal: BranchSignal = {
      similarity: match.semanticSimilarity,
      score: match.score,
      anchor,
      keywordOverlap: match.keywordOverlap,
      lineageId: lineage.id,
    };
    if (signal.score > best.score) best = signal;
  }
  return best;
}

function buildExplanation(
  classification: Classification,
  topicLabel: string,
  rootSimilarity: number,
  localCoherence: number,
  crossedBoundary: boolean,
): string {
  const boundaryNote = crossedBoundary ? ' A topic boundary was also detected.' : '';
  const root = rootSimilarity.toFixed(2);
  const local = localCoherence.toFixed(2);

  switch (classification) {
    case 'ON_PATH':
      return `This turn stays on the main thread around ${topicLabel} with strong local coherence (${local}) and root relevance (${root}).${boundaryNote}`;
    case 'DEEPENING':
      return `This turn deepens the ongoing topic into ${topicLabel} while remaining connected to the root topic (${root}) and local cluster (${local}).${boundaryNote}`;
    case 'SIDE_QUEST':
      return `This turn branches into ${topicLabel}. It drifts from the immediate trail but still keeps some connection to the root topic (${root}) or nearby cluster (${local}).${boundaryNote}`;
    case 'RETURN_TO_PATH':
      return `This turn reconnects to the main thread through ${topicLabel}. Root relevance recovered to ${root}, indicating a return from the earlier drift.${boundaryNote}`;
    default:
      return `This turn likely diverged from the main thread because it introduced ${topicLabel} with low root relevance (${root}) and low local coherence (${local}).${boundaryNote}`;
  }
}

function buildEdgeRelationship(classification: Classification): EdgeRelationship {
  switch (classification) {
    case 'DEEPENING':
      return 'deepening';
    case 'SIDE_QUEST':
      return 'side_quest';
    case 'RABBIT_HOLE':
      return 'rabbit_hole_jump';
    case 'RETURN_TO_PATH':
      return 'return_to_path';
    default:
      return 'main_path';
  }
}

function uiMetaForClassification(classification: Classification, isFirst: boolean): TurnUiMeta {
  if (isFirst) return { path_type: 'main', node_type: 'start' };
  if (classification === 'SIDE_QUEST') return { path_type: 'side', node_type: 'normal' };
  if (classification === 'RABBIT_HOLE') return { path_type: 'rabbit_hole', node_type: 'broken' };
  if (classification === 'RETURN_TO_PATH') return { path_type: 'return', node_type: 'return' };
  return { path_type: 'main', node_type: 'normal' };
}

function buildTransitionEdges(
  turns: ConversationTurn[],
  analyses: TurnAnalysis[],
  traversalMeta: TurnTraversalMeta[],
): TrailEdge[] {
  const edges: TrailEdge[] = [];
  for (let index = 1; index < turns.length; index += 1) {
    const previousTurn = turns[index - 1];
    const currentTurn = turns[index];
    const currentAnalysis = analyses[index];
    const previousMeta = traversalMeta[index - 1];
    const currentMeta = traversalMeta[index];
    const transitionId = `transition-${currentTurn.id}`;
    const directRelationship = buildEdgeRelationship(currentAnalysis.classification);

    if (currentAnalysis.classification === 'RABBIT_HOLE') {
      edges.push({
        source: previousTurn.id,
        target: currentTurn.id,
        relationship: directRelationship,
        strength: round4(currentAnalysis.prev_similarity),
        transition_id: transitionId,
        sequence: 0,
      });
      continue;
    }

    if (currentMeta.lineageId === previousMeta.lineageId) {
      edges.push({
        source: previousTurn.id,
        target: currentTurn.id,
        relationship: directRelationship,
        strength: round4(currentAnalysis.prev_similarity),
        transition_id: transitionId,
        sequence: 0,
      });
      continue;
    }

    const anchorTurnId = currentMeta.anchorTurnId || currentMeta.forkTurnId || previousMeta.forkTurnId || null;
    if (anchorTurnId && anchorTurnId !== previousTurn.id) {
      edges.push({
        source: previousTurn.id,
        target: anchorTurnId,
        relationship: 'backtrack',
        strength: round4(currentAnalysis.prev_similarity),
        transition_id: transitionId,
        sequence: 0,
      });
    }

    let followupRelationship: EdgeRelationship = 'rejoin_path';
    if (currentMeta.lineageId !== null && currentMeta.lineageId > 0) {
      followupRelationship = 'fork_out';
    } else if (currentAnalysis.classification !== 'RETURN_TO_PATH' && currentAnalysis.classification !== 'ON_PATH') {
      followupRelationship = directRelationship;
    }

    edges.push({
      source: anchorTurnId || previousTurn.id,
      target: currentTurn.id,
      relationship: followupRelationship,
      strength: round4(currentAnalysis.prev_similarity),
      transition_id: transitionId,
      sequence: anchorTurnId && anchorTurnId !== previousTurn.id ? 1 : 0,
    });
  }
  return edges;
}

function summarize(analyses: TurnAnalysis[]): AnalysisSummary {
  return {
    total_turns: analyses.length,
    rabbit_holes: analyses.filter((turn) => turn.classification === 'RABBIT_HOLE').length,
    side_quests: analyses.filter((turn) => turn.classification === 'SIDE_QUEST').length,
    returns_to_path: analyses.filter((turn) => turn.classification === 'RETURN_TO_PATH').length,
  };
}

// --- DriftAnalyzer ---------------------------------------------------------------

export interface DriftAnalyzerOptions {
  config?: AnalysisConfig;
  embeddingProvider: EmbeddingProvider;
  modelAssist?: ModelAssistService;
}

export class DriftAnalyzer {
  private readonly config: AnalysisConfig;
  private readonly embeddingProvider: EmbeddingProvider;
  readonly modelAssist: ModelAssistService;

  constructor(options: DriftAnalyzerOptions) {
    this.config = options.config ?? DEFAULT_CONFIG;
    this.embeddingProvider = options.embeddingProvider;
    this.modelAssist = options.modelAssist ?? new NoopModelAssistService(this.config);
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const turns = request.turns.filter((turn) => normalizeText(turn.text));
    if (turns.length === 0) {
      throw new Error('Conversation does not contain any non-empty turns.');
    }

    const requestedMode: AnalysisMode = request.analysis_mode ?? 'deterministic';
    const actualMode = this.resolveMode(requestedMode);
    const preparedTurns = await this.prepareTurns(turns, actualMode);
    const analysisTexts = preparedTurns.map((prepared) => prepared.analysisText);
    const embeddings = await this.embeddingProvider.encodeTexts(analysisTexts);
    const deterministicResponse = analyzeDeterministicSync({
      conversationId: request.conversation_id,
      turns,
      preparedTurns,
      analysisMode: actualMode,
      config: this.config,
      embeddings,
    });

    if (actualMode !== 'probabilistic') {
      return deterministicResponse;
    }

    const probabilisticResponse = await this.applyProbabilisticOverlay(deterministicResponse, preparedTurns);
    if (probabilisticResponse) {
      return probabilisticResponse;
    }

    deterministicResponse.analysis_mode = this.modelAssist.available ? 'hybrid' : 'deterministic';
    return deterministicResponse;
  }

  private resolveMode(requestedMode: AnalysisMode): AnalysisMode {
    if (requestedMode === 'deterministic') return requestedMode;
    return this.modelAssist.available ? requestedMode : 'deterministic';
  }

  private async prepareTurns(turns: ConversationTurn[], analysisMode: AnalysisMode): Promise<PreparedTurn[]> {
    const prepared: PreparedTurn[] = [];
    let previousContext = '';

    for (const turn of turns) {
      const rawPromptText = normalizeText(turn.prompt_text) || normalizeText(turn.text);
      const promptText = contextualizePromptText(rawPromptText, previousContext, this.config);
      const responseText = normalizeText(turn.response_text);

      let responseFocusText: string;
      if (turn.response_focus_text) {
        responseFocusText = normalizeText(turn.response_focus_text);
      } else if (responseText) {
        responseFocusText = await this.modelAssist.summarizeResponse(promptText, responseText, analysisMode);
      } else {
        responseFocusText = '';
      }

      const topicText =
        normalizeText([promptText, responseFocusText].filter(Boolean).join('\n\n')) || normalizeText(turn.text);

      prepared.push({
        promptText,
        responseText,
        responseFocusText,
        analysisText: buildAnalysisText(promptText, responseFocusText, turn.text),
        topicText,
      });
      previousContext = topicText || normalizeText(turn.text);
    }
    return prepared;
  }

  /** Exposed for tests, mirroring the Python test suite's direct call to `_prepare_turns`. */
  async prepareTurnsForTesting(turns: ConversationTurn[], analysisMode: AnalysisMode): Promise<PreparedTurn[]> {
    return this.prepareTurns(turns, analysisMode);
  }

  private async applyProbabilisticOverlay(
    response: AnalysisResponse,
    preparedTurns: PreparedTurn[],
  ): Promise<AnalysisResponse | null> {
    const turnInputs: ProbabilisticTurnInput[] = response.turns.map((turn, index) => ({
      id: turn.id,
      promptText: preparedTurns[index].promptText,
      responseFocusText: preparedTurns[index].responseFocusText || normalizeText(turn.text),
      prevSimilarity: turn.prev_similarity,
      localSimilarity: turn.local_similarity,
      rootSimilarity: turn.root_similarity,
      mainlineSimilarity: turn.local_similarity,
      branchSimilarity: Math.max(turn.local_similarity - turn.root_similarity, 0),
      lineageAnchorScore: Math.max(turn.root_similarity, turn.local_coherence_score),
      driftScore: turn.drift_score,
      localCoherenceScore: turn.local_coherence_score,
    }));

    const decision = await this.modelAssist.classifyConversation(response.root_topic.label, turnInputs);
    if (!decision) return null;

    const decisionById = new Map(decision.turns.map((item) => [item.id, item]));
    response.root_topic.label = decision.rootTopicLabel;
    response.analysis_mode = 'probabilistic';

    response.turns.forEach((turn, index) => {
      const overlay = decisionById.get(turn.id);
      if (!overlay) return;
      turn.topic_label = overlay.topicLabel;
      turn.classification = overlay.classification;
      turn.explanation = overlay.explanation;
      turn.classification_probabilities = overlay.probabilities;
      turn.decision_source = 'llm' as DecisionSource;
      turn.ui = uiMetaForClassification(overlay.classification, index === 0);
    });

    response.edges.forEach((edge, index) => {
      const turn = response.turns[index + 1];
      if (turn) edge.relationship = buildEdgeRelationship(turn.classification);
    });

    response.summary = summarize(response.turns);
    return response;
  }
}

// Split out as a standalone function (rather than inlined in the async analyze()
// path) since it's entirely synchronous once embeddings are computed -- keeps the
// classification cascade easy to unit test independent of the async embedding call.
function analyzeDeterministicSync(options: {
  conversationId: string;
  turns: ConversationTurn[];
  preparedTurns: PreparedTurn[];
  analysisMode: AnalysisMode;
  config: AnalysisConfig;
  embeddings: number[][];
}): AnalysisResponse {
  const { conversationId, turns, preparedTurns, analysisMode, config, embeddings } = options;

  const topicTexts = preparedTurns.map((prepared) => prepared.topicText);
  const keywordSets = preparedTurns.map((prepared) => keywordSet(prepared.topicText));

  const clusterIds = agglomerativeClusterLabels(embeddings, config.clusterDistanceThreshold);
  const topicLabels = buildTopicLabels(topicTexts, clusterIds);

  const pairwiseDistances: number[] = [];
  for (let index = 1; index < embeddings.length; index += 1) {
    pairwiseDistances.push(1.0 - cosineSimilarity(embeddings[index], embeddings[index - 1]));
  }
  const changePoints = detectChangePoints(pairwiseDistances);

  const rootCount = Math.min(config.rootTurnWindow, turns.length);
  const rootIndices = Array.from({ length: rootCount }, (_, i) => i);
  const rootEmbeddings = rootIndices.map((index) => embeddings[index]);
  const rootCentroid = meanCentroid(rootEmbeddings, embeddings[0]);
  const rootLabel = buildRootTopicLabel(rootIndices.map((index) => topicTexts[index]));
  const rootKeywords = mergeKeywordSets(rootIndices.map((index) => keywordSets[index]));

  const analyses: TurnAnalysis[] = [];
  const traversalMeta: TurnTraversalMeta[] = [];
  const mainlineLineage = new TrackedLineage({ id: 0, lane: 'mainline', createdTurnIndex: 0, parentLineageId: 0 });
  const branchLineages = new Map<number, TrackedLineage>();
  let nextBranchId = 1;
  let previousClassification: Classification = 'ON_PATH';
  let previousRootSimilarity = 1.0;
  let lastStableTurnId: number | null = null;

  turns.forEach((turn, index) => {
    const embedding = embeddings[index];
    const keywords = keywordSets[index];
    const mainlineCentroid = mainlineLineage.centroid(rootCentroid);
    const mainlineKeywords = mainlineLineage.keywords().size > 0 ? mainlineLineage.keywords() : rootKeywords;
    const prevKeywords = index > 0 ? keywordSets[index - 1] : rootKeywords;

    let prevSimilarity = index === 0 ? 1.0 : cosineSimilarity(embedding, embeddings[index - 1]);
    let rootSimilarity = cosineSimilarity(embedding, rootCentroid);
    let mainPathSimilarity = cosineSimilarity(embedding, mainlineCentroid);
    const prevKeywordOverlap = keywordOverlap(keywords, prevKeywords);
    const rootKeywordOverlap = keywordOverlap(keywords, rootKeywords);
    const mainPathKeywordOverlap = keywordOverlap(keywords, mainlineKeywords);

    const bestBranch = selectBestBranchSignal({
      lineages: [...branchLineages.values()],
      turnIndex: index,
      embedding,
      keywords,
      rootCentroid,
      mainlineCentroid,
      rootKeywords,
      mainlineKeywords,
      config,
    });

    let localSimilarity = Math.max(mainPathSimilarity, bestBranch.similarity);
    const localKeywordOverlap = Math.max(mainPathKeywordOverlap, bestBranch.keywordOverlap);
    const continuityOverlap = Math.max(
      prevKeywordOverlap,
      localKeywordOverlap,
      rootKeywordOverlap,
      mainPathKeywordOverlap,
      bestBranch.keywordOverlap,
    );
    const branchAnchor = Math.max(bestBranch.anchor, rootSimilarity, mainPathSimilarity, continuityOverlap);

    prevSimilarity = boostSimilarity(prevSimilarity, prevKeywordOverlap, config.lexicalPrevBoost);
    localSimilarity = boostSimilarity(
      localSimilarity,
      Math.max(localKeywordOverlap, prevKeywordOverlap, bestBranch.keywordOverlap),
      config.lexicalLocalBoost,
    );
    rootSimilarity = boostSimilarity(rootSimilarity, rootKeywordOverlap, config.lexicalRootBoost);
    mainPathSimilarity = boostSimilarity(
      mainPathSimilarity,
      Math.max(mainPathKeywordOverlap, localKeywordOverlap, rootKeywordOverlap, bestBranch.keywordOverlap),
      config.lexicalMainPathBoost,
    );
    const branchSimilarity = boostSimilarity(bestBranch.similarity, bestBranch.keywordOverlap, config.lexicalLocalBoost);
    const localCoherence = 0.5 * localSimilarity + 0.3 * prevSimilarity + 0.2 * Math.max(mainPathSimilarity, branchSimilarity);
    const noveltyScore = 1.0 - Math.max(localSimilarity, rootSimilarity, mainPathSimilarity);
    const changePointBonus = changePoints.has(index) ? config.changePointBonus : 0.0;
    const driftScore = clamp(
      1.0 -
        (config.weightPrevSimilarity * prevSimilarity +
          config.weightLocalSimilarity * localSimilarity +
          config.weightRootSimilarity * rootSimilarity +
          config.weightMainPathSimilarity * Math.max(mainPathSimilarity, branchSimilarity)) +
        changePointBonus,
    );

    const classification = classifyTurn({
      index,
      previousClassification,
      previousRootSimilarity,
      prevSimilarity,
      localSimilarity,
      rootSimilarity,
      mainPathSimilarity,
      branchSimilarity,
      branchAnchor,
      noveltyScore,
      driftScore,
      continuityOverlap,
      config,
    });

    const topicLabel = topicLabels.get(clusterIds[index]) ?? 'Conversation topic';
    const explanation = buildExplanation(classification, topicLabel, rootSimilarity, localCoherence, changePoints.has(index));

    const previousMeta = traversalMeta[traversalMeta.length - 1] ?? null;
    let createBranchId: number | null = null;
    let assignedLineageId: number | null;
    let forkTurnId: number | null = null;
    let anchorTurnId: number | null = null;

    if (index === 0) {
      assignedLineageId = 0;
    } else if (classification === 'RABBIT_HOLE') {
      assignedLineageId = null;
      anchorTurnId = lastStableTurnId;
    } else if (classification === 'ON_PATH' || classification === 'RETURN_TO_PATH') {
      assignedLineageId = 0;
      if (previousMeta && previousMeta.lineageId !== null && previousMeta.lineageId !== 0) {
        anchorTurnId = previousMeta.forkTurnId ?? lastStableTurnId;
      } else if (previousClassification === 'RABBIT_HOLE') {
        anchorTurnId = lastStableTurnId;
      }
    } else {
      if (bestBranch.lineageId !== null && bestBranch.score >= config.lineageMatchThreshold) {
        assignedLineageId = bestBranch.lineageId;
        forkTurnId = branchLineages.get(assignedLineageId)!.forkTurnId;
      } else if (branchAnchor >= config.lineageCreateThreshold) {
        assignedLineageId = nextBranchId;
        createBranchId = nextBranchId;
        forkTurnId = index > 0 ? turns[index - 1].id : null;
      } else {
        assignedLineageId = 0;
      }

      if (assignedLineageId !== null && assignedLineageId > 0) {
        anchorTurnId = forkTurnId;
      }
    }

    traversalMeta.push({ lineageId: assignedLineageId, forkTurnId, anchorTurnId });

    analyses.push({
      id: turn.id,
      role: turn.role,
      text: turn.text,
      prompt_text: preparedTurns[index].promptText || undefined,
      response_text: preparedTurns[index].responseText || undefined,
      response_focus_text: preparedTurns[index].responseFocusText || undefined,
      source_roles: turn.source_roles,
      source_message_count: turn.source_message_count,
      topic_label: topicLabel,
      cluster_id: clusterIds[index],
      lineage_id: assignedLineageId,
      fork_turn_id: forkTurnId,
      anchor_turn_id: anchorTurnId,
      classification,
      drift_score: round4(driftScore),
      root_relevance_score: round4(rootSimilarity),
      local_coherence_score: round4(localCoherence),
      prev_similarity: round4(prevSimilarity),
      local_similarity: round4(localSimilarity),
      root_similarity: round4(rootSimilarity),
      explanation,
      decision_source: 'deterministic',
      ui: uiMetaForClassification(classification, index === 0),
    });

    if (MAIN_PATH_CLASSES.has(classification)) {
      mainlineLineage.addTurn({ turnIndex: index, embedding, keywords });
    }

    if (assignedLineageId !== null && assignedLineageId > 0) {
      if (createBranchId !== null) {
        const parentLineageId = previousMeta && previousMeta.lineageId !== null ? previousMeta.lineageId : 0;
        branchLineages.set(
          createBranchId,
          new TrackedLineage({
            id: createBranchId,
            lane: 'branch',
            createdTurnIndex: index,
            parentLineageId,
            forkTurnId,
            seedRootSimilarity: rootSimilarity,
            seedMainlineSimilarity: mainPathSimilarity,
          }),
        );
        nextBranchId += 1;
      }
      branchLineages.get(assignedLineageId)!.addTurn({ turnIndex: index, embedding, keywords });
    }

    previousClassification = classification;
    previousRootSimilarity = rootSimilarity;
    if (assignedLineageId !== null) lastStableTurnId = turn.id;
  });

  const edges = buildTransitionEdges(turns, analyses, traversalMeta);
  const summary = summarize(analyses);

  return {
    conversation_id: conversationId,
    analysis_mode: analysisMode,
    root_topic: { label: rootLabel, centroid_turn_ids: rootIndices.map((index) => turns[index].id) },
    turns: analyses,
    edges,
    summary,
  };
}

function classifyTurn(options: {
  index: number;
  previousClassification: Classification;
  previousRootSimilarity: number;
  prevSimilarity: number;
  localSimilarity: number;
  rootSimilarity: number;
  mainPathSimilarity: number;
  branchSimilarity: number;
  branchAnchor: number;
  noveltyScore: number;
  driftScore: number;
  continuityOverlap: number;
  config: AnalysisConfig;
}): Classification {
  const {
    index,
    previousClassification,
    previousRootSimilarity,
    prevSimilarity,
    localSimilarity,
    rootSimilarity,
    mainPathSimilarity,
    branchSimilarity,
    branchAnchor,
    noveltyScore,
    driftScore,
    continuityOverlap,
    config,
  } = options;

  if (index === 0) return 'ON_PATH';

  if (
    (previousClassification === 'SIDE_QUEST' || previousClassification === 'RABBIT_HOLE') &&
    rootSimilarity >= config.returnRootSimilarity &&
    mainPathSimilarity >= config.returnMainPathSimilarity &&
    rootSimilarity - previousRootSimilarity >= config.returnSimilarityRebound
  ) {
    return 'RETURN_TO_PATH';
  }

  if (
    prevSimilarity < config.rabbitPrevSimilarity &&
    localSimilarity < config.rabbitLocalSimilarity &&
    rootSimilarity < config.rabbitRootSimilarity &&
    mainPathSimilarity < config.rabbitMainPathSimilarity &&
    branchSimilarity < config.branchRabbitGuard &&
    continuityOverlap <= config.rabbitLexicalOverlapMax &&
    driftScore >= config.rabbitDriftScore
  ) {
    return 'RABBIT_HOLE';
  }

  if (
    prevSimilarity >= config.onPathPrevSimilarity &&
    localSimilarity >= config.onPathLocalSimilarity &&
    rootSimilarity >= config.onPathRootSimilarity &&
    mainPathSimilarity >= config.onPathMainPathSimilarity
  ) {
    return 'ON_PATH';
  }

  if (
    continuityOverlap >= config.onPathLexicalOverlap &&
    prevSimilarity >= config.onPathContinuityPrevSimilarity &&
    localSimilarity >= config.onPathContinuityLocalSimilarity &&
    rootSimilarity >= config.onPathContinuityRootSimilarity &&
    mainPathSimilarity >= config.onPathContinuityMainPathSimilarity
  ) {
    return 'ON_PATH';
  }

  if (
    branchSimilarity >= config.branchDeepeningSimilarity &&
    branchAnchor >= config.branchDeepeningAnchor &&
    noveltyScore >= config.deepeningNoveltyMin &&
    noveltyScore <= config.deepeningNoveltyMax
  ) {
    return 'DEEPENING';
  }

  if (
    localSimilarity >= config.deepeningLocalSimilarity &&
    rootSimilarity >= config.deepeningRootSimilarity &&
    mainPathSimilarity >= config.deepeningMainPathSimilarity &&
    noveltyScore >= config.deepeningNoveltyMin &&
    noveltyScore <= config.deepeningNoveltyMax
  ) {
    return 'DEEPENING';
  }

  if (
    continuityOverlap >= config.deepeningLexicalOverlap &&
    localSimilarity >= config.deepeningContinuityLocalSimilarity &&
    rootSimilarity >= config.deepeningContinuityRootSimilarity &&
    mainPathSimilarity >= config.deepeningContinuityMainPathSimilarity
  ) {
    return 'DEEPENING';
  }

  if (branchSimilarity >= config.branchSideSimilarity && branchAnchor >= config.branchSideAnchor) {
    return 'SIDE_QUEST';
  }

  if (
    rootSimilarity >= config.sideQuestRootSimilarity ||
    localSimilarity >= config.sideQuestLocalSimilarity ||
    mainPathSimilarity >= config.sideQuestRootSimilarity
  ) {
    return 'SIDE_QUEST';
  }

  return 'RABBIT_HOLE';
}
