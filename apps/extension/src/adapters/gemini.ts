import type { SiteAdapter } from './types';

function unsupportedError(): never {
  throw new Error('Gemini support is scaffolded but not implemented in this MVP.');
}

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  label: 'Gemini',
  canHandle(url) {
    return url.hostname.includes('gemini.google.com');
  },
  getConversationId(location) {
    return `gemini:${location.pathname}`;
  },
  extractTurns() {
    unsupportedError();
  },
  scrollToTurn() {
    unsupportedError();
  },
};
