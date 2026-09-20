/**
 * Direct 1:1 port of apps/backend/app/services/lineages.py.
 */
import type { AnalysisConfig } from './config';

export function cosineSimilarity(left: Float64Array | number[], right: Float64Array | number[]): number {
  if (left.length === 0 || right.length === 0) return 0.0;
  let dot = 0;
  let leftNormSq = 0;
  let rightNormSq = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNormSq += left[i] * left[i];
    rightNormSq += right[i] * right[i];
  }
  const denominator = Math.sqrt(leftNormSq) * Math.sqrt(rightNormSq);
  if (denominator === 0) return 0.0;
  return dot / denominator;
}

// Asymmetric: divides by the size of the SMALLER set.
export function keywordOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0.0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  if (shared === 0) return 0.0;
  return shared / Math.max(1, Math.min(left.size, right.size));
}

export function mergeKeywordSets(keywordSets: Iterable<Set<string>>): Set<string> {
  const merged = new Set<string>();
  for (const keywordSet of keywordSets) {
    for (const token of keywordSet) merged.add(token);
  }
  return merged;
}

export function meanCentroid(vectors: number[][], fallback: number[]): number[] {
  if (vectors.length === 0) return fallback;
  const dim = vectors[0].length;
  const centroid = new Array<number>(dim).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dim; i += 1) centroid[i] += vector[i];
  }
  for (let i = 0; i < dim; i += 1) centroid[i] /= vectors.length;
  let norm = 0;
  for (let i = 0; i < dim; i += 1) norm += centroid[i] * centroid[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return fallback;
  return centroid.map((value) => value / norm);
}

export interface LineageMatch {
  lineageId: number;
  semanticSimilarity: number;
  keywordOverlap: number;
  score: number;
  age: number;
}

export interface TrackedLineageOptions {
  id: number;
  lane: string;
  createdTurnIndex: number;
  parentLineageId?: number;
  forkTurnId?: number | null;
  seedRootSimilarity?: number;
  seedMainlineSimilarity?: number;
}

export class TrackedLineage {
  id: number;
  lane: string;
  createdTurnIndex: number;
  parentLineageId: number;
  forkTurnId: number | null;
  turnIndices: number[] = [];
  embeddings: number[][] = [];
  keywordSets: Set<string>[] = [];
  lastTurnIndex = -1;
  seedRootSimilarity: number;
  seedMainlineSimilarity: number;

  constructor(options: TrackedLineageOptions) {
    this.id = options.id;
    this.lane = options.lane;
    this.createdTurnIndex = options.createdTurnIndex;
    this.parentLineageId = options.parentLineageId ?? 0;
    this.forkTurnId = options.forkTurnId ?? null;
    this.seedRootSimilarity = options.seedRootSimilarity ?? 0.0;
    this.seedMainlineSimilarity = options.seedMainlineSimilarity ?? 0.0;
  }

  addTurn(options: { turnIndex: number; embedding: number[]; keywords: Set<string> }): void {
    this.turnIndices.push(options.turnIndex);
    this.embeddings.push(options.embedding);
    this.keywordSets.push(new Set(options.keywords));
    this.lastTurnIndex = options.turnIndex;
  }

  centroid(fallback: number[]): number[] {
    return meanCentroid(this.embeddings, fallback);
  }

  keywords(): Set<string> {
    return mergeKeywordSets(this.keywordSets);
  }

  match(options: {
    turnIndex: number;
    embedding: number[];
    keywords: Set<string>;
    fallbackCentroid: number[];
    config: AnalysisConfig;
  }): LineageMatch {
    const { turnIndex, embedding, keywords, fallbackCentroid, config } = options;
    const semanticSimilarity = cosineSimilarity(embedding, this.centroid(fallbackCentroid));
    const overlap = keywordOverlap(keywords, this.keywords());
    const age = Math.max(turnIndex - this.lastTurnIndex, 0);
    const recencyBonus =
      config.lineageRecencyBonus * Math.max(0.0, 1.0 - age / Math.max(config.lineageMaxAgeTurns, 1));
    const staleTurns = Math.max(age - config.lineageMaxAgeTurns, 0);
    const stalePenalty = staleTurns * config.lineageStalePenalty;
    const score =
      config.lineageSimilarityWeight * semanticSimilarity +
      config.lineageKeywordWeight * overlap +
      recencyBonus -
      stalePenalty;
    return {
      lineageId: this.id,
      semanticSimilarity,
      keywordOverlap: overlap,
      score,
      age,
    };
  }

  anchorScore(options: {
    rootCentroid: number[];
    mainlineCentroid: number[];
    rootKeywords: Set<string>;
    mainlineKeywords: Set<string>;
  }): number {
    const { rootCentroid, mainlineCentroid, rootKeywords, mainlineKeywords } = options;
    const centroid = this.centroid(rootCentroid);
    const rootSimilarity = cosineSimilarity(centroid, rootCentroid);
    const mainlineSimilarity = cosineSimilarity(centroid, mainlineCentroid);
    const rootOverlap = keywordOverlap(this.keywords(), rootKeywords);
    const mainlineOverlap = keywordOverlap(this.keywords(), mainlineKeywords);
    return Math.max(
      0.5 * rootSimilarity + 0.3 * mainlineSimilarity + 0.2 * rootOverlap,
      0.45 * rootSimilarity + 0.25 * mainlineSimilarity + 0.3 * mainlineOverlap,
      this.seedRootSimilarity * 0.55 + this.seedMainlineSimilarity * 0.25 + rootOverlap * 0.2,
    );
  }
}
