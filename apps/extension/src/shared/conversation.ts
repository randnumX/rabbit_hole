import type { ConversationRole, ConversationTurn } from '@rabbithole/shared-types';

export interface ConversationItem<TMeta> {
  role: ConversationRole;
  text: string;
  meta: TMeta;
}

export interface CollapsedConversationTurn<TMeta> extends ConversationTurn {
  metaItems: TMeta[];
  sourceRoles: ConversationRole[];
}

const LOW_SIGNAL_PATTERNS = [
  /^yes[.!]*$/i,
  /^yeah[.!]*$/i,
  /^yep[.!]*$/i,
  /^yup[.!]*$/i,
  /^ok(?:ay)?[.!]*$/i,
  /^sure[.!]*$/i,
  /^cool[.!]*$/i,
  /^got it[.!]*$/i,
  /^thanks(?: you)?[.!]*$/i,
  /^sounds good[.!]*$/i,
  /^makes sense[.!]*$/i,
  /^continue[.!]*$/i,
  /^go on[.!]*$/i,
  /^please continue[.!]*$/i,
  /^exactly[.!]*$/i,
  /^right[.!]*$/i,
  /^perfect[.!]*$/i,
];

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function titleCaseRole(role: ConversationRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function isLowSignalAcknowledgement(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized.length > 28) {
    return false;
  }

  return LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function composeExchangeText<TMeta>(items: ConversationItem<TMeta>[]): string {
  return items
    .map((item) => `${titleCaseRole(item.role)}: ${normalizeWhitespace(item.text)}`)
    .join('\n\n');
}

function joinRoleText<TMeta>(items: ConversationItem<TMeta>[], role: ConversationRole): string {
  const filtered = items.filter((item) => item.role === role).map((item) => normalizeWhitespace(item.text)).filter(Boolean);
  if (role === 'user' && filtered.length > 1) {
    const substantive = filtered.filter((text) => !isLowSignalAcknowledgement(text));
    if (substantive.length > 0) {
      return substantive.join('\n\n');
    }
  }
  return filtered.join('\n\n');
}

function inferPromptText<TMeta>(items: ConversationItem<TMeta>[]): string {
  const promptText = joinRoleText(items, 'user') || joinRoleText(items, 'system');
  if (promptText) {
    return promptText;
  }
  return normalizeWhitespace(items[0]?.text ?? '');
}

function inferResponseText<TMeta>(items: ConversationItem<TMeta>[]): string {
  const responseText = joinRoleText(items, 'assistant');
  if (responseText) {
    return responseText;
  }
  const trailingItems = items.slice(1).map((item) => normalizeWhitespace(item.text)).filter(Boolean);
  return trailingItems.join('\n\n');
}

export function collapseConversationItems<TMeta>(
  items: ConversationItem<TMeta>[],
): CollapsedConversationTurn<TMeta>[] {
  const exchanges: ConversationItem<TMeta>[][] = [];
  let currentExchange: ConversationItem<TMeta>[] = [];

  const flush = () => {
    if (currentExchange.length === 0) {
      return;
    }
    exchanges.push(currentExchange);
    currentExchange = [];
  };

  for (const item of items) {
    const text = normalizeWhitespace(item.text);
    if (!text) {
      continue;
    }

    const normalizedItem = {
      ...item,
      text,
    };

    if (item.role === 'user') {
      if (currentExchange.length > 0 && isLowSignalAcknowledgement(text)) {
        currentExchange.push(normalizedItem);
        continue;
      }

      flush();
      currentExchange = [normalizedItem];
      continue;
    }

    if (currentExchange.length === 0) {
      currentExchange = [normalizedItem];
      continue;
    }

    currentExchange.push(normalizedItem);
  }

  flush();

  return exchanges.map((exchange, index) => ({
    id: index + 1,
    role: exchange[0]?.role ?? 'user',
    text: composeExchangeText(exchange),
    prompt_text: inferPromptText(exchange),
    response_text: inferResponseText(exchange) || undefined,
    metaItems: exchange.map((item) => item.meta),
    sourceRoles: exchange.map((item) => item.role),
    source_message_count: exchange.length,
  }));
}

export function collapseConversationTurns(turns: ConversationTurn[]): ConversationTurn[] {
  return collapseConversationItems(
    turns.map((turn) => ({
      role: turn.role,
      text: turn.text,
      meta: turn.id,
    })),
  ).map(({ id, role, text, prompt_text, response_text, sourceRoles, source_message_count }) => ({
    id,
    role,
    text,
    prompt_text,
    response_text,
    source_roles: sourceRoles,
    source_message_count,
  }));
}
