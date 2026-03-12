import type { AnalysisRequest, AnalysisResponse } from '@rabbithole/shared-types';
import rawConversation from '../../../../examples/conversations/chatgpt-sample-raw.json';
import analyzedConversation from '../../../../examples/conversations/chatgpt-sample-analysis.json';

export const sampleConversationRequest = rawConversation as AnalysisRequest;
export const sampleAnalysis = analyzedConversation as AnalysisResponse;
