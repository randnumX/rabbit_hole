import type { AnalysisMode, AnalysisRequest, AnalysisResponse } from '@rabbithole/shared-types';
import { sampleAnalysis, sampleConversationRequest } from '@/fixtures';
import { DriftAnalyzer, NoopModelAssistService } from '@/analysis/analyzer';
import { DEFAULT_CONFIG } from '@/analysis/config';
import { TransformersEmbeddingProvider } from '@/analysis/embeddings';
import { HttpModelAssistService, pingLlmEndpoint } from '@/analysis/llmClient';
import { getStoredLlmSettings } from '@/shared/llmSettings';
import { buildAnalysisRequestFingerprint } from '@/shared/requestFingerprint';
import type {
  AnalyzeResponsePayload,
  BackgroundRequestMessage,
  BackgroundResponse,
  BackendStatusPayload,
  SampleConversationPayload,
} from '@/shared/messages';

const analysisCache = new Map<string, AnalysisResponse>();

// Reused across requests so the embedding model (and its WASM/IndexedDB-cached
// weights) is only loaded once per service-worker lifetime, not per analysis call.
const embeddingProvider = new TransformersEmbeddingProvider();

function buildCacheKey(pageUrl: string, request: AnalysisRequest): string {
  return `${pageUrl}::${buildAnalysisRequestFingerprint(request)}`;
}

function availableModesFor(llmReachable: boolean): AnalysisMode[] {
  const modes: AnalysisMode[] = ['deterministic'];
  if (llmReachable) modes.push('hybrid', 'probabilistic');
  return modes;
}

/**
 * Replaces the old FastAPI /api/health check: reports whether the embedding
 * engine fell back to hashing embeddings, and whether a configured LLM endpoint
 * is currently reachable (gates Hybrid/Probabilistic mode availability).
 */
async function checkStatus(): Promise<BackendStatusPayload> {
  const llmSettings = await getStoredLlmSettings();
  const llmReachable = llmSettings ? await pingLlmEndpoint(llmSettings) : false;

  return {
    status: 'online',
    modelName: embeddingProvider.modelName,
    fallbackActive: embeddingProvider.fallbackActive,
    llmAvailable: llmReachable,
    llmModel: llmSettings?.model,
    availableModes: availableModesFor(llmReachable),
    checkedAt: Date.now(),
  };
}

async function analyzeConversation(message: BackgroundRequestMessage): Promise<BackgroundResponse<AnalyzeResponsePayload>> {
  if (message.type !== 'ANALYZE_CONVERSATION') {
    return {
      ok: false,
      error: 'Unsupported analysis request.',
    };
  }

  const cacheKey = buildCacheKey(message.payload.pageUrl, message.payload.request);
  if (!message.payload.force && analysisCache.has(cacheKey)) {
    return {
      ok: true,
      data: {
        analysis: analysisCache.get(cacheKey)!,
        cacheHit: true,
      },
    };
  }

  try {
    const llmSettings = await getStoredLlmSettings();
    const modelAssist = llmSettings
      ? new HttpModelAssistService(DEFAULT_CONFIG, llmSettings)
      : new NoopModelAssistService(DEFAULT_CONFIG);
    const analyzer = new DriftAnalyzer({ embeddingProvider, modelAssist });

    const analysis = await analyzer.analyze(message.payload.request);
    analysisCache.set(cacheKey, analysis);

    return {
      ok: true,
      data: {
        analysis,
        cacheHit: false,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Analysis failed.',
    };
  }
}

function loadSampleConversation(): BackgroundResponse<SampleConversationPayload> {
  return {
    ok: true,
    data: {
      request: sampleConversationRequest,
      analysis: sampleAnalysis,
    },
  };
}

chrome.runtime.onMessage.addListener((message: BackgroundRequestMessage, _sender, sendResponse) => {
  if (message.type === 'BACKEND_STATUS') {
    void checkStatus().then((status) => sendResponse({ ok: true, data: status }));
    return true;
  }

  if (message.type === 'LOAD_SAMPLE_CONVERSATION') {
    sendResponse(loadSampleConversation());
    return false;
  }

  if (message.type === 'ANALYZE_CONVERSATION') {
    void analyzeConversation(message)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown analysis error',
        }),
      );
    return true;
  }

  sendResponse({
    ok: false,
    error: 'Unknown message type.',
  });
  return false;
});
