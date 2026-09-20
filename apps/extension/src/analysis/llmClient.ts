/**
 * Replaces apps/backend/app/services/model_assist.py + local_llm.py. Instead of
 * managing a local torch model or an OpenAI SDK client process-side, this speaks
 * the OpenAI chat-completions wire format directly to a user-configured HTTP
 * endpoint -- a remote API (OpenAI itself, any OpenAI-compatible proxy) or a local
 * server such as Ollama (`/v1/chat/completions`) or LM Studio. Same two call sites
 * as the Python service (summarizeResponse for Hybrid+, classifyConversation for
 * Probabilistic only), same prompts, same strict all-or-nothing classification
 * validation.
 */
import type { AnalysisMode, Classification, ClassificationProbabilities } from '@rabbithole/shared-types';
import type { AnalysisConfig } from './config';
import { heuristicFocusSummary, normalizeText, shouldModelSummarize } from './focus';
import type {
  ModelAssistService,
  ProbabilisticConversationDecision,
  ProbabilisticTurnDecision,
  ProbabilisticTurnInput,
} from './analyzer';

export interface LlmSettings {
  /** Full URL including path, e.g. http://localhost:11434/v1/chat/completions or https://api.openai.com/v1/chat/completions */
  endpointUrl: string;
  apiKey?: string;
  model: string;
}

const CLASSIFICATION_NAMES: Classification[] = ['ON_PATH', 'DEEPENING', 'SIDE_QUEST', 'RABBIT_HOLE', 'RETURN_TO_PATH'];

async function callChatCompletions(
  settings: LlmSettings,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  const response = await fetch(settings.endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM endpoint responded with ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('LLM endpoint response did not contain choices[0].message.content.');
  }
  return content;
}

function extractJsonPayload(text: string): Record<string, unknown> {
  const stripped = text.trim();
  if (!stripped) throw new Error('Model response was empty.');

  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Model response did not contain a JSON object.');
    }
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  }
}

function normalizeProbabilities(raw: unknown, fallback: Classification): ClassificationProbabilities {
  const rawRecord = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const values: Record<string, number> = {};
  let total = 0;
  for (const name of CLASSIFICATION_NAMES) {
    const value = Math.max(Number(rawRecord[name] ?? 0) || 0, 0);
    values[name] = value;
    total += value;
  }

  if (total <= 0) {
    for (const name of CLASSIFICATION_NAMES) values[name] = 0;
    values[fallback] = 1.0;
    total = 1.0;
  }

  const normalized: Record<string, number> = {};
  for (const name of CLASSIFICATION_NAMES) {
    normalized[name] = Math.round((values[name] / total) * 10000) / 10000;
  }
  return normalized as unknown as ClassificationProbabilities;
}

/** Simple in-memory cache -- correctness only requires stable results within a session, not cryptographic keys. */
function cacheKey(...parts: string[]): string {
  return parts.join('\u0000');
}

export class HttpModelAssistService implements ModelAssistService {
  readonly available = true;

  private readonly summaryCache = new Map<string, string>();
  private readonly classificationCache = new Map<string, ProbabilisticConversationDecision>();

  constructor(private readonly config: AnalysisConfig, private readonly settings: LlmSettings) {}

  async summarizeResponse(promptText: string, responseText: string, mode: AnalysisMode): Promise<string> {
    const heuristic = heuristicFocusSummary(promptText, responseText, this.config);
    if (mode === 'deterministic' || !shouldModelSummarize(responseText, this.config)) {
      return heuristic;
    }

    const key = cacheKey('summary', promptText, responseText);
    const cached = this.summaryCache.get(key);
    if (cached) return cached;

    const systemPrompt =
      "You compress long assistant replies for RabbitHole's semantic drift tracker. " +
      'Keep the main topic, decision, or technical direction. Drop lists, prices, sales language, and repeated examples. ' +
      'Return plain text only in 1-2 short sentences.';
    const userPrompt = `User prompt:\n${promptText}\n\nAssistant response:\n${responseText}`;

    let summary: string;
    try {
      summary = await callChatCompletions(
        this.settings,
        systemPrompt,
        userPrompt,
        this.config.summaryMaxTokens,
        this.config.llmSummaryTemperature,
      );
    } catch {
      return heuristic;
    }

    let cleaned = normalizeText(summary);
    if (!cleaned) return heuristic;

    if (cleaned.length > this.config.focusSummaryCharBudget) {
      const truncated = cleaned.slice(0, this.config.focusSummaryCharBudget);
      const lastSpace = truncated.lastIndexOf(' ');
      cleaned = (lastSpace >= 0 ? truncated.slice(0, lastSpace) : truncated).trim();
    }

    this.summaryCache.set(key, cleaned);
    return cleaned;
  }

  async classifyConversation(
    rootTopicLabel: string,
    turns: ProbabilisticTurnInput[],
  ): Promise<ProbabilisticConversationDecision | null> {
    const payload = {
      root_topic_label: rootTopicLabel,
      turns: turns.map((turn) => ({
        id: turn.id,
        prompt_text: turn.promptText,
        response_focus_text: turn.responseFocusText,
        prev_similarity: turn.prevSimilarity,
        local_similarity: turn.localSimilarity,
        root_similarity: turn.rootSimilarity,
        mainline_similarity: turn.mainlineSimilarity,
        branch_similarity: turn.branchSimilarity,
        lineage_anchor_score: turn.lineageAnchorScore,
        drift_score: turn.driftScore,
        local_coherence_score: turn.localCoherenceScore,
      })),
    };
    const payloadJson = JSON.stringify(payload);
    const key = cacheKey('probabilistic', payloadJson);
    const cached = this.classificationCache.get(key);
    if (cached) return cached;

    const systemPrompt =
      'You classify RabbitHole exchange nodes. Use the root topic plus the provided similarity metrics. ' +
      'Treat repeated technical troubleshooting within the same root problem as ON_PATH or DEEPENING, not as a rabbit hole. ' +
      'Use SIDE_QUEST only for still-related branches. Use RABBIT_HOLE only when the turn is weak against the root topic, mainline, and branch lineages. ' +
      'Return JSON only.';
    const userPrompt =
      'Return this exact shape:\n' +
      '{"root_topic_label":"string","turns":[{"id":1,"topic_label":"string","classification":"ON_PATH","explanation":"string","probabilities":{"ON_PATH":0.0,"DEEPENING":0.0,"SIDE_QUEST":0.0,"RABBIT_HOLE":0.0,"RETURN_TO_PATH":0.0}}]}\n' +
      'Probabilities must sum to 1.\n\n' +
      `Conversation data:\n${payloadJson}`;

    let parsed: Record<string, unknown>;
    try {
      const raw = await callChatCompletions(
        this.settings,
        systemPrompt,
        userPrompt,
        this.config.classificationMaxTokens,
        this.config.llmClassificationTemperature,
      );
      parsed = extractJsonPayload(raw);
    } catch {
      return null;
    }

    const turnMap = new Map(turns.map((turn) => [turn.id, turn]));
    const decisions: ProbabilisticTurnDecision[] = [];
    const rawTurns = Array.isArray(parsed.turns) ? (parsed.turns as unknown[]) : [];

    for (const item of rawTurns) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const turnId = Number(record.id);
      const classification = record.classification as Classification;
      if (!Number.isFinite(turnId) || !CLASSIFICATION_NAMES.includes(classification)) continue;
      if (!turnMap.has(turnId)) continue;

      decisions.push({
        id: turnId,
        topicLabel: normalizeText(record.topic_label as string) || 'Conversation topic',
        classification,
        explanation: normalizeText(record.explanation as string) || 'Model-assisted classification.',
        probabilities: normalizeProbabilities(record.probabilities, classification),
      });
    }

    if (decisions.length !== turns.length) return null;

    decisions.sort((a, b) => a.id - b.id);
    const result: ProbabilisticConversationDecision = {
      rootTopicLabel: normalizeText(parsed.root_topic_label as string) || rootTopicLabel,
      turns: decisions,
    };
    this.classificationCache.set(key, result);
    return result;
  }
}

/** Lightweight reachability check used for the extension's health/status display. */
export async function pingLlmEndpoint(settings: LlmSettings): Promise<boolean> {
  try {
    await callChatCompletions(settings, 'ping', 'ping', 4, 0);
    return true;
  } catch {
    return false;
  }
}
