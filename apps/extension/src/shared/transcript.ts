import type { AnalysisRequest, ConversationRole, ConversationTurn } from '@rabbithole/shared-types';
import { collapseConversationTurns } from '@/shared/conversation';

const ROLE_PREFIX_PATTERN = /^(user|assistant|system)\s*:\s*(.+)$/i;

function normalizeRole(role: string): ConversationRole {
  const lowered = role.toLowerCase();
  if (lowered === 'assistant') {
    return 'assistant';
  }
  if (lowered === 'system') {
    return 'system';
  }
  return 'user';
}

export function parseDebugTranscript(input: string): ConversationTurn[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as Array<{ role: ConversationRole; text: string }>;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((entry) => entry?.text?.trim())
        .map((entry, index) => ({
          id: index + 1,
          role: entry.role ?? (index % 2 === 0 ? 'user' : 'assistant'),
          text: entry.text.trim(),
        }));
    }
  } catch {
    // Fall back to role-prefixed parsing.
  }

  const lines = trimmed.split('\n').map((line) => line.trim());
  const turns: ConversationTurn[] = [];
  let currentRole: ConversationRole | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentRole || buffer.length === 0) {
      return;
    }

    turns.push({
      id: turns.length + 1,
      role: currentRole,
      text: buffer.join('\n').trim(),
    });
    buffer = [];
  };

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const match = line.match(ROLE_PREFIX_PATTERN);
    if (match) {
      flush();
      currentRole = normalizeRole(match[1]);
      buffer = [match[2]];
      continue;
    }

    if (!currentRole) {
      currentRole = turns.length % 2 === 0 ? 'user' : 'assistant';
    }
    buffer.push(line);
  }

  flush();
  return turns.filter((turn) => turn.text.trim());
}

export function buildDebugAnalysisRequest(turns: ConversationTurn[]): AnalysisRequest {
  return {
    conversation_id: 'debug-pasted-transcript',
    source: 'debug',
    turns: collapseConversationTurns(turns),
  };
}
