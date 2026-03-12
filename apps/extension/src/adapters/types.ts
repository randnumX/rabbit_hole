import type { ConversationSource, ConversationTurn } from '@rabbithole/shared-types';
import type { TranscriptTargetContext } from '@/shared/transcriptTarget';

export interface ConversationActivityHandlers {
  onTypingChange?: (typing: boolean) => void;
  onWaitingChange?: (waiting: boolean) => void;
  onConversationSettled?: () => void;
}

export interface ExtractedConversation {
  source: ConversationSource;
  conversationId: string;
  turns: ConversationTurn[];
  warnings: string[];
}

export interface SiteAdapter {
  id: ConversationSource;
  label: string;
  canHandle(url: URL): boolean;
  getConversationId(location: Location): string;
  extractTurns(document: Document): ExtractedConversation;
  scrollToTurn(turnId: number, context?: TranscriptTargetContext): void;
  observeActivity?(document: Document, handlers: ConversationActivityHandlers): () => void;
}
