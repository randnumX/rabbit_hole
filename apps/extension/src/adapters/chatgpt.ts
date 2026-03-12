import type { ConversationRole, ConversationTurn } from '@rabbithole/shared-types';
import { APP_IDS } from '@/shared/config';
import { collapseConversationItems } from '@/shared/conversation';
import type { TranscriptTargetContext } from '@/shared/transcriptTarget';
import type { ConversationActivityHandlers, ExtractedConversation, SiteAdapter } from './types';

const MESSAGE_SELECTOR = '[data-message-author-role]';
const COMPOSER_SELECTOR = [
  '#prompt-textarea',
  '[data-testid="prompt-textarea"]',
  'form textarea',
  'form [contenteditable="true"]',
].join(', ');
const SEND_BUTTON_SELECTOR = [
  'button[data-testid="send-button"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
].join(', ');
const LOG_PREFIX = '[RabbitHole]';

interface CollapsedTurnSnapshot {
  id: number;
  text: string;
  promptText: string;
  responseText: string;
  metaItems: HTMLElement[];
}

let lastCollapsedTurns: CollapsedTurnSnapshot[] = [];

function recordJumpState(payload: Record<string, unknown>) {
  try {
    (window as Window & { __rabbitholeLastJump?: Record<string, unknown> }).__rabbitholeLastJump = payload;
  } catch {
    // Ignore debug state write failures.
  }
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || Boolean(element.textContent?.trim());
}

function normalizeRole(rawRole: string | null, index: number): ConversationRole {
  if (rawRole === 'assistant' || rawRole === 'user' || rawRole === 'system') {
    return rawRole;
  }
  return index % 2 === 0 ? 'user' : 'assistant';
}

function normalizeText(rawText?: string): string {
  return (rawText ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function normalizeForMatch(rawText?: string): string {
  return normalizeText(rawText)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toCollapsedSnapshot(
  turn: Pick<ConversationTurn, 'id' | 'text' | 'prompt_text' | 'response_text'> & { metaItems: HTMLElement[] },
): CollapsedTurnSnapshot {
  return {
    id: turn.id,
    text: turn.text,
    promptText: turn.prompt_text ?? '',
    responseText: turn.response_text ?? '',
    metaItems: turn.metaItems,
  };
}

function overlapScore(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return shorter / longer;
  }

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function buildMatchContext(
  explicitContext: TranscriptTargetContext | undefined,
  cachedTurn: CollapsedTurnSnapshot | undefined,
): TranscriptTargetContext | undefined {
  if (explicitContext?.promptText || explicitContext?.responseText || explicitContext?.text) {
    return explicitContext;
  }

  if (!cachedTurn) {
    return undefined;
  }

  return {
    promptText: cachedTurn.promptText,
    responseText: cachedTurn.responseText,
    text: cachedTurn.text,
  };
}

function scoreMatch(turn: CollapsedTurnSnapshot, context: TranscriptTargetContext): number {
  const promptScore = overlapScore(normalizeForMatch(context.promptText), normalizeForMatch(turn.promptText));
  const responseScore = overlapScore(normalizeForMatch(context.responseText), normalizeForMatch(turn.responseText));
  const textScore = overlapScore(normalizeForMatch(context.text), normalizeForMatch(turn.text));

  return promptScore * 0.52 + responseScore * 0.36 + textScore * 0.12;
}

function findBestTurnMatch(
  turns: CollapsedTurnSnapshot[],
  context: TranscriptTargetContext | undefined,
): CollapsedTurnSnapshot | null {
  if (!context?.promptText && !context?.responseText && !context?.text) {
    return null;
  }

  let bestTurn: CollapsedTurnSnapshot | null = null;
  let bestScore = 0;

  for (const turn of turns) {
    const score = scoreMatch(turn, context);
    if (score > bestScore) {
      bestScore = score;
      bestTurn = turn;
    }
  }

  return bestScore >= 0.34 ? bestTurn : null;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  if (node.tagName === 'PRE') {
    const preText = node.innerText ?? node.textContent ?? '';
    return `\n\`\`\`\n${preText.trim()}\n\`\`\`\n`;
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  const isBlock =
    ['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4'].includes(node.tagName);
  const content = Array.from(node.childNodes)
    .map((child) => serializeNode(child))
    .join('');

  if (isBlock) {
    return `${content}\n`;
  }

  return content;
}

function serializeMessage(element: HTMLElement): string {
  const markdown = element.querySelector('.markdown, [data-testid="markdown"]') as HTMLElement | null;
  const source = markdown ?? element;
  const serialized = normalizeText(serializeNode(source));
  return serialized || normalizeText(source.innerText || element.innerText);
}

function findMessageContainers(documentRef: Document, visibleOnly = true): HTMLElement[] {
  const candidates = Array.from(documentRef.querySelectorAll(MESSAGE_SELECTOR)) as HTMLElement[];
  if (!visibleOnly) {
    return candidates.filter((element) => Boolean(serializeMessage(element)));
  }
  return candidates.filter((element) => isVisible(element));
}

function clearTranscriptMarkers(documentRef: Document) {
  for (const element of documentRef.querySelectorAll<HTMLElement>(`[${APP_IDS.transcriptAttribute}]`)) {
    element.removeAttribute(APP_IDS.transcriptAttribute);
  }
}

function buildCollapsedConversation(documentRef: Document, visibleOnly = true) {
  const containers = findMessageContainers(documentRef, visibleOnly);
  const rawMessages = containers
    .map((element, index) => {
      const text = serializeMessage(element);
      const role = normalizeRole(element.getAttribute('data-message-author-role'), index);
      return {
        role,
        text,
        meta: element,
      };
    })
    .filter((turn) => turn.text.length > 0);

  return {
    rawMessages,
    collapsed: collapseConversationItems(rawMessages),
  };
}

function buildConversationSignature(documentRef: Document): string {
  return buildCollapsedConversation(documentRef, true).collapsed
    .map(
      (turn) =>
        [
          turn.id,
          normalizeForMatch(turn.prompt_text),
          normalizeForMatch(turn.response_text),
          normalizeForMatch(turn.text),
        ].join('::'),
    )
    .join('||');
}

function findComposerElement(documentRef: Document): HTMLElement | null {
  return Array.from(documentRef.querySelectorAll<HTMLElement>(COMPOSER_SELECTOR)).find((element) => {
    if (element.tagName === 'TEXTAREA') {
      return true;
    }
    return element.isContentEditable;
  }) ?? null;
}

function readComposerText(documentRef: Document): string {
  const composer = findComposerElement(documentRef);
  if (!composer) {
    return '';
  }

  if (composer instanceof HTMLTextAreaElement) {
    return normalizeText(composer.value);
  }

  return normalizeText(composer.innerText || composer.textContent || '');
}

function isComposerTarget(target: EventTarget | null, composer: HTMLElement | null): boolean {
  if (!target || !composer) {
    return false;
  }

  return target === composer || (target instanceof Node && composer.contains(target));
}

function nodeTouchesTranscript(node: Node | null): boolean {
  if (!node) {
    return false;
  }

  const element = node instanceof HTMLElement ? node : node.parentElement;
  if (!element) {
    return false;
  }

  if (element.id === APP_IDS.mountId || element.closest(`#${APP_IDS.mountId}`)) {
    return false;
  }

  return Boolean(element.closest(MESSAGE_SELECTOR));
}

function mutationTouchesTranscript(mutation: MutationRecord): boolean {
  if (nodeTouchesTranscript(mutation.target)) {
    return true;
  }

  return (
    Array.from(mutation.addedNodes).some((node) => nodeTouchesTranscript(node)) ||
    Array.from(mutation.removedNodes).some((node) => nodeTouchesTranscript(node))
  );
}


function scrollAndHighlightTargets(targets: HTMLElement[]) {
  const primaryTarget = targets.find((element) => isVisible(element)) ?? targets[0];
  const scrollTarget =
    typeof primaryTarget.scrollIntoView === 'function'
      ? primaryTarget
      : (targets.find(
          (element) =>
            element.parentElement && typeof element.parentElement.scrollIntoView === 'function',
        )?.parentElement as HTMLElement | undefined) ?? primaryTarget;
  const payload = {
    targetCount: targets.length,
    primaryVisible: isVisible(primaryTarget),
    targetPreview: normalizeText(primaryTarget.innerText || primaryTarget.textContent || '').slice(0, 120),
    usedFallbackTarget: scrollTarget !== primaryTarget,
  };
  console.info(`${LOG_PREFIX} scrolling to transcript target`, payload);
  recordJumpState({ stage: 'scroll', ...payload });
  if (typeof scrollTarget.scrollIntoView === 'function') {
    scrollTarget.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }

  for (const target of targets) {
    target.dataset.rabbitholeHighlight = 'true';
  }

  window.setTimeout(() => {
    for (const target of targets) {
      delete target.dataset.rabbitholeHighlight;
    }
  }, 1800);
}

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  label: 'ChatGPT',
  canHandle(url) {
    return ['chatgpt.com', 'chat.openai.com'].includes(url.hostname);
  },
  getConversationId(location) {
    const match = location.pathname.match(/\/(c|share)\/([^/]+)/);
    const tail = match?.[2] ?? location.pathname.replace(/\W+/g, '-').replace(/^-+|-+$/g, '');
    return `chatgpt-${tail || 'current-page'}`;
  },
  extractTurns(documentRef) {
    const warnings: string[] = [];
    const containers = findMessageContainers(documentRef);

    if (containers.length === 0) {
      return {
        source: 'chatgpt',
        conversationId: this.getConversationId(window.location),
        turns: [],
        warnings: ['No visible ChatGPT conversation messages were found.'],
      };
    }

    const { rawMessages, collapsed } = buildCollapsedConversation(documentRef, true);
    lastCollapsedTurns = collapsed.map((turn) => toCollapsedSnapshot(turn));
    clearTranscriptMarkers(documentRef);
    const turns: ConversationTurn[] = collapsed.map(
      ({ id, role, text, prompt_text, response_text, sourceRoles, source_message_count, metaItems }) => {
        for (const element of metaItems) {
          element.setAttribute(APP_IDS.transcriptAttribute, String(id));
        }

        return {
          id,
          role,
          text,
          prompt_text,
          response_text,
          source_roles: sourceRoles,
          source_message_count,
        };
      },
    );

    if (turns.length === 0) {
      warnings.push('ChatGPT messages were found but did not contain readable text.');
    }

    if (rawMessages.length > turns.length) {
      warnings.push(`Collapsed ${rawMessages.length} raw messages into ${turns.length} exchange nodes.`);
    }

    return {
      source: 'chatgpt',
      conversationId: this.getConversationId(window.location),
      turns,
      warnings,
    } satisfies ExtractedConversation;
  },
  scrollToTurn(turnId, context) {
    console.info(`${LOG_PREFIX} jump requested`, { turnId });
    recordJumpState({ stage: 'requested', turnId });

    function queryMarked(): HTMLElement[] {
      return Array.from(
        document.querySelectorAll<HTMLElement>(`[${APP_IDS.transcriptAttribute}="${turnId}"]`),
      ).filter((el) => el.isConnected);
    }

    let targets = queryMarked();
    const cachedTurn = lastCollapsedTurns.find((turn) => turn.id === turnId);

    if (targets.length === 0) {
      const connectedCachedTargets = cachedTurn?.metaItems.filter((element) => element.isConnected) ?? [];
      if (connectedCachedTargets.length > 0) {
        console.info(`${LOG_PREFIX} using cached transcript nodes`, { turnId, targets: connectedCachedTargets.length });
        recordJumpState({ stage: 'cached', turnId, targets: connectedCachedTargets.length });
        for (const element of connectedCachedTargets) {
          element.setAttribute(APP_IDS.transcriptAttribute, String(turnId));
        }
        targets = connectedCachedTargets;
      }
    }

    if (targets.length === 0) {
      console.info(`${LOG_PREFIX} rebuilt collapsed transcript map`, { turnId });
      recordJumpState({ stage: 'restamping', turnId });
      const { collapsed } = buildCollapsedConversation(document, false);
      const currentTurns = collapsed.map((turn) => toCollapsedSnapshot(turn));
      const matchContext = buildMatchContext(context, cachedTurn);
      const matchedTurn =
        findBestTurnMatch(currentTurns, matchContext) ??
        currentTurns.find((turn) => turn.id === turnId) ??
        null;

      clearTranscriptMarkers(document);

      if (matchedTurn) {
        const matchPayload = {
          turnId,
          matchedTurnId: matchedTurn.id,
          targetCount: matchedTurn.metaItems.length,
          matchedPrompt: normalizeText(matchedTurn.promptText).slice(0, 120),
        };
        console.info(`${LOG_PREFIX} resolved turn match`, matchPayload);
        recordJumpState({ stage: 'matched', ...matchPayload });
        for (const element of matchedTurn.metaItems) {
          element.setAttribute(APP_IDS.transcriptAttribute, String(turnId));
        }
      }

      targets = queryMarked();
    }

    if (targets.length === 0) {
      console.info(`${LOG_PREFIX} transcript jump failed`, { turnId });
      recordJumpState({ stage: 'failed', turnId });
      throw new Error(`Could not find transcript turn ${turnId}.`);
    }

    console.info(`${LOG_PREFIX} scrolling to transcript target`, { turnId, targets: targets.length });
    recordJumpState({ stage: 'scroll', turnId, targets: targets.length });
    scrollAndHighlightTargets(targets);
  },
  observeActivity(documentRef, handlers) {
    let typing = false;
    let waiting = false;
    let transcriptSignature = buildConversationSignature(documentRef);
    let settleTimer = 0;

    const emitTyping = (next: boolean) => {
      if (typing === next) {
        return;
      }
      typing = next;
      handlers.onTypingChange?.(next);
    };

    const emitWaiting = (next: boolean) => {
      if (waiting === next) {
        return;
      }
      waiting = next;
      handlers.onWaitingChange?.(next);
    };

    const syncTypingFromComposer = () => {
      const hasDraft = Boolean(readComposerText(documentRef));
      if (hasDraft) {
        emitWaiting(false);
        emitTyping(true);
        return;
      }

      if (!waiting) {
        emitTyping(false);
      }
    };

    const markWaitingForReply = () => {
      if (!readComposerText(documentRef)) {
        return;
      }

      emitTyping(false);
      emitWaiting(true);
    };

    const observer = new MutationObserver((mutations) => {
      if (!mutations.some(mutationTouchesTranscript)) {
        return;
      }

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        const nextSignature = buildConversationSignature(documentRef);
        if (nextSignature === transcriptSignature) {
          return;
        }

        transcriptSignature = nextSignature;
        emitWaiting(false);
        syncTypingFromComposer();
        handlers.onConversationSettled?.();
      }, 1100);
    });

    observer.observe(documentRef.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const handleInput = (event: Event) => {
      const composer = findComposerElement(documentRef);
      if (!isComposerTarget(event.target, composer)) {
        return;
      }
      syncTypingFromComposer();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const composer = findComposerElement(documentRef);
      if (!isComposerTarget(event.target, composer)) {
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        markWaitingForReply();
      }
    };

    const handleSubmit = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest('form')) {
        return;
      }
      markWaitingForReply();
    };

    const handleClick = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest(SEND_BUTTON_SELECTOR)) {
        return;
      }
      markWaitingForReply();
    };

    documentRef.addEventListener('input', handleInput, true);
    documentRef.addEventListener('keydown', handleKeyDown, true);
    documentRef.addEventListener('submit', handleSubmit, true);
    documentRef.addEventListener('click', handleClick, true);
    syncTypingFromComposer();

    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimer);
      documentRef.removeEventListener('input', handleInput, true);
      documentRef.removeEventListener('keydown', handleKeyDown, true);
      documentRef.removeEventListener('submit', handleSubmit, true);
      documentRef.removeEventListener('click', handleClick, true);
    };
  },
};
