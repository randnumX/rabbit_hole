import type { SiteAdapter } from './types';

function unsupportedError(): never {
  throw new Error('Claude support is scaffolded but not implemented in this MVP.');
}

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  label: 'Claude',
  canHandle(url) {
    return url.hostname.includes('claude.ai');
  },
  getConversationId(location) {
    return `claude:${location.pathname}`;
  },
  extractTurns() {
    unsupportedError();
  },
  scrollToTurn() {
    unsupportedError();
  },
};
