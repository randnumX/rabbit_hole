import type { AnalysisRequest, ConversationTurn } from '@rabbithole/shared-types';

function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function turnSignature(turn: ConversationTurn): string {
  return [
    turn.id,
    turn.role,
    normalizeText(turn.prompt_text),
    normalizeText(turn.response_text),
    normalizeText(turn.text),
  ].join('|');
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function buildAnalysisRequestFingerprint(request: AnalysisRequest): string {
  const signature = [
    request.conversation_id,
    request.source,
    request.analysis_mode ?? 'deterministic',
    request.turns.map(turnSignature).join('||'),
  ].join('::');

  return `${request.turns.length}:${hashString(signature)}`;
}
