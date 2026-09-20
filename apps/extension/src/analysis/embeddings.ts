/**
 * Replaces apps/backend/app/services/embeddings.py. The Python backend loaded a
 * local sentence-transformers model process-side; here we run the same model
 * (all-MiniLM-L6-v2) in-browser via transformers.js (WASM/ONNX), with a
 * deterministic hashing fallback if the model fails to load -- mirroring the
 * Python code's own sentence-transformers -> HashingVectorizer fallback path.
 */
import { ENGLISH_STOP_WORDS } from './tfidf';

export interface EmbeddingProvider {
  readonly modelName: string;
  readonly fallbackActive: boolean;
  encodeTexts(texts: string[]): Promise<number[][]>;
}

function normalizeRows(vectors: number[][]): number[][] {
  return vectors.map((vector) => {
    let normSq = 0;
    for (const value of vector) normSq += value * value;
    const norm = Math.sqrt(normSq);
    if (norm === 0) return vector;
    return vector.map((value) => value / norm);
  });
}

// FNV-1a: deterministic, stable across runs -- exact parity with sklearn's
// HashingVectorizer's internal hash isn't required since this is only a
// degraded fallback path, not the primary embedding source.
function fnv1aHash(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const HASH_BUCKETS = 512;
const TOKEN_PATTERN = /\b\w\w+\b/gu;

function hashTokenize(text: string): string[] {
  const raw = (text.toLowerCase().match(TOKEN_PATTERN) ?? []).filter((token) => !ENGLISH_STOP_WORDS.has(token));
  const tokens: string[] = [...raw];
  for (let i = 0; i < raw.length - 1; i += 1) tokens.push(`${raw[i]} ${raw[i + 1]}`);
  return tokens;
}

/** Deterministic feature-hashing fallback, mirroring FallbackEmbeddingProvider. */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'hashing-fallback';
  readonly fallbackActive = true;

  async encodeTexts(texts: string[]): Promise<number[][]> {
    const vectors = texts.map((text) => {
      const vector = new Array<number>(HASH_BUCKETS).fill(0);
      for (const token of hashTokenize(text)) {
        vector[fnv1aHash(token) % HASH_BUCKETS] += 1;
      }
      return vector;
    });
    return normalizeRows(vectors);
  }
}

type FeatureExtractionPipeline = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

/**
 * Runs Xenova/all-MiniLM-L6-v2 (ONNX build of the same model
 * apps/backend/app/config.py used) in-browser via transformers.js. Falls back to
 * HashingEmbeddingProvider if the pipeline fails to load or run, mirroring
 * SentenceTransformerEmbeddingProvider's own fallback behavior.
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  modelName = 'Xenova/all-MiniLM-L6-v2';
  fallbackActive = false;

  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
  private fallback: HashingEmbeddingProvider | null = null;

  private async ensurePipeline(): Promise<FeatureExtractionPipeline | null> {
    if (this.fallback) return null;
    if (!this.pipelinePromise) {
      this.pipelinePromise = import('@huggingface/transformers')
        .then(({ pipeline }) => (pipeline as (task: string, model: string) => Promise<unknown>)('feature-extraction', this.modelName))
        .then((extractor) => extractor as FeatureExtractionPipeline)
        .catch((error) => {
          console.warn('[RabbitHole] Failed to load embedding model; falling back to hashing embeddings.', error);
          this.activateFallback();
          throw error;
        });
    }
    try {
      return await this.pipelinePromise;
    } catch {
      return null;
    }
  }

  private activateFallback(): void {
    this.fallback = new HashingEmbeddingProvider();
    this.modelName = this.fallback.modelName;
    this.fallbackActive = true;
  }

  async encodeTexts(texts: string[]): Promise<number[][]> {
    const extractor = await this.ensurePipeline();
    if (!extractor || this.fallback) {
      return (this.fallback ?? new HashingEmbeddingProvider()).encodeTexts(texts);
    }

    try {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist();
    } catch (error) {
      console.warn('[RabbitHole] Embedding model failed during encode; falling back to hashing embeddings.', error);
      this.activateFallback();
      return this.fallback!.encodeTexts(texts);
    }
  }
}

/**
 * Deterministic fixed-vector provider for tests, mirroring the Python test suite's
 * FakeEmbeddingProvider exactly: it ignores the input texts entirely and always
 * returns the same fixed embeddings array, positionally aligned to however many
 * turns the analyzer passes in a single encodeTexts call.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly modelName = 'fake-embedding-provider';
  readonly fallbackActive = false;

  constructor(private readonly vectors: number[][]) {}

  async encodeTexts(_texts: string[]): Promise<number[][]> {
    return this.vectors;
  }
}
