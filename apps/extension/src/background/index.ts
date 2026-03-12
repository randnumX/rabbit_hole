import type { AnalysisMode, AnalysisRequest, AnalysisResponse } from '@rabbithole/shared-types';
import { sampleAnalysis, sampleConversationRequest } from '@/fixtures';
import { DEFAULT_BACKEND_URL } from '@/shared/config';
import { buildAnalysisRequestFingerprint } from '@/shared/requestFingerprint';
import type {
  AnalyzeResponsePayload,
  BackgroundRequestMessage,
  BackgroundResponse,
  BackendStatusPayload,
  SampleConversationPayload,
} from '@/shared/messages';

const analysisCache = new Map<string, AnalysisResponse>();

function buildCacheKey(pageUrl: string, request: AnalysisRequest): string {
  return `${pageUrl}::${buildAnalysisRequestFingerprint(request)}`;
}

async function fetchBackendStatus(): Promise<BackendStatusPayload> {
  try {
    const response = await fetch(`${DEFAULT_BACKEND_URL}/api/health`);
    if (!response.ok) {
      throw new Error(`Health check failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      model_name: string;
      fallback_active?: boolean;
      llm_available?: boolean;
      llm_model?: string;
      available_modes?: AnalysisMode[];
    };
    const status: BackendStatusPayload = {
      status: 'online',
      modelName: payload.model_name,
      fallbackActive: Boolean(payload.fallback_active),
      llmAvailable: Boolean(payload.llm_available),
      llmModel: payload.llm_model,
      availableModes: payload.available_modes,
      checkedAt: Date.now(),
    };
    return status;
  } catch (error) {
    const status: BackendStatusPayload = {
      status: 'offline',
      checkedAt: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown backend error',
    };
    return status;
  }
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

  const response = await fetch(`${DEFAULT_BACKEND_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message.payload.request),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      ok: false,
      error: detail || `Analysis failed with ${response.status}`,
    };
  }

  const analysis = (await response.json()) as AnalysisResponse;
  analysisCache.set(cacheKey, analysis);

  return {
    ok: true,
    data: {
      analysis,
      cacheHit: false,
    },
  };
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
    void fetchBackendStatus().then((status) => sendResponse({ ok: true, data: status }));
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
