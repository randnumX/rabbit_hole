import type { AnalysisMode, AnalysisRequest, AnalysisResponse } from '@rabbithole/shared-types';

export type ExtensionMessageType =
  | 'EXTRACT_CONVERSATION'
  | 'ANALYZE_CONVERSATION'
  | 'SCROLL_TO_TURN'
  | 'LOAD_SAMPLE_CONVERSATION'
  | 'BACKEND_STATUS';

export interface BackendStatusPayload {
  status: 'online' | 'offline';
  modelName?: string;
  fallbackActive?: boolean;
  llmAvailable?: boolean;
  llmModel?: string;
  availableModes?: AnalysisMode[];
  checkedAt: number;
  error?: string;
}

export interface AnalyzeConversationMessage {
  type: 'ANALYZE_CONVERSATION';
  payload: {
    request: AnalysisRequest;
    pageUrl: string;
    force?: boolean;
  };
}

export interface BackendStatusMessage {
  type: 'BACKEND_STATUS';
}

export interface LoadSampleConversationMessage {
  type: 'LOAD_SAMPLE_CONVERSATION';
}

export interface ExtractConversationMessage {
  type: 'EXTRACT_CONVERSATION';
}

export interface ScrollToTurnMessage {
  type: 'SCROLL_TO_TURN';
  payload: {
    turnId: number;
  };
}

export type BackgroundRequestMessage =
  | AnalyzeConversationMessage
  | BackendStatusMessage
  | LoadSampleConversationMessage;

export interface SampleConversationPayload {
  request: AnalysisRequest;
  analysis: AnalysisResponse;
}

export interface BackgroundResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AnalyzeResponsePayload {
  analysis: AnalysisResponse;
  cacheHit: boolean;
}

export function buildScrollMessage(turnId: number): ScrollToTurnMessage {
  return {
    type: 'SCROLL_TO_TURN',
    payload: { turnId },
  };
}
