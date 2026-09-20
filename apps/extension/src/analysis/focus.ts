/**
 * Near-verbatim port of apps/backend/app/services/focus.py.
 * V8 supports lookbehind assertions, so the Python regexes translate directly.
 */
import type { AnalysisConfig } from './config';

export const SENTENCE_SPLIT_PATTERN = /(?<=[.!?])(?:\s+|(?=[A-Z0-9]))/;
export const NOISY_LINE_PATTERN = /^\s*(?:[-*•]|\d+[.)]|[₹$€£])/;
export const CALL_TO_ACTION_PATTERN = /^(?:would you like|if you like|let me know|i can also)\b/i;
export const WORD_PATTERN = /[A-Za-z][A-Za-z0-9+-]{1,}/g;
export const CONTEXTUAL_PROMPT_PATTERN =
  /^(?:yes|yes please|yeah|yep|ok(?:ay)?|cool|and\b|also\b|then\b|what about|what if|how about|would it|can i|can we|is it|is that|is this|give me|show me|part of this|this amount|that amount|sorry\b|i meant\b|no not this\b)/i;
export const CONTEXTUAL_TOKENS = new Set([
  'this',
  'that',
  'it',
  'those',
  'these',
  'same',
  'amount',
  'plan',
  'roadmap',
  'timeline',
  'checklist',
]);

export function normalizeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function* iterSentences(text: string): Iterable<string> {
  for (const block of text.split('\n')) {
    const stripped = block.trim();
    if (!stripped) continue;
    if (SENTENCE_SPLIT_PATTERN.test(stripped)) {
      for (const sentence of stripped.split(SENTENCE_SPLIT_PATTERN)) {
        const trimmed = sentence.trim();
        if (trimmed) yield trimmed;
      }
      continue;
    }
    yield stripped;
  }
}

function keywordTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.matchAll(WORD_PATTERN)) {
    tokens.add(match[0].toLowerCase());
  }
  return tokens;
}

function digitRatio(text: string): number {
  if (!text) return 0.0;
  let digitCount = 0;
  for (const character of text) {
    if (character >= '0' && character <= '9') digitCount += 1;
  }
  return digitCount / Math.max(text.length, 1);
}

function isNoisyLine(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  if (normalized.length < 16) return true;
  if (digitRatio(normalized) > 0.22) return true;
  return NOISY_LINE_PATTERN.test(normalized);
}

function scoreSentence(sentence: string, promptKeywords: Set<string>, index: number): number {
  const tokens = keywordTokens(sentence);
  if (tokens.size === 0) return -5.0;
  let overlap = 0;
  for (const token of tokens) {
    if (promptKeywords.has(token)) overlap += 1;
  }
  const uniqueScore = Math.min(tokens.size, 12) * 0.35;
  const promptScore = overlap * 1.8;
  const lengthPenalty = Math.max(sentence.length - 220, 0) * 0.01;
  const numericPenalty = digitRatio(sentence) * 6.0;
  const orderingBias = Math.max(0, 4 - index) * 0.4;
  const noisePenalty = isNoisyLine(sentence) ? 2.4 : 0.0;
  const questionPenalty = sentence.endsWith('?') ? 0.8 : 0.0;
  const ctaPenalty = CALL_TO_ACTION_PATTERN.test(sentence.trim()) ? 1.4 : 0.0;
  return (
    promptScore +
    uniqueScore +
    orderingBias -
    lengthPenalty -
    numericPenalty -
    noisePenalty -
    questionPenalty -
    ctaPenalty
  );
}

export function heuristicFocusSummary(promptText: string, responseText: string, config: AnalysisConfig): string {
  const normalizedResponse = normalizeText(responseText);
  if (!normalizedResponse) return '';

  const promptKeywords = keywordTokens(promptText);
  const sentences = Array.from(iterSentences(normalizedResponse));
  if (sentences.length === 0) {
    return normalizedResponse.slice(0, config.focusSummaryCharBudget).trim();
  }

  let selected: Array<{ index: number; sentence: string; score: number }> = [];
  sentences.forEach((sentence, index) => {
    const score = scoreSentence(sentence, promptKeywords, index);
    if (score <= 0) return;
    selected.push({ index, sentence, score });
  });

  if (selected.length === 0) {
    selected = sentences
      .slice(0, config.focusSummarySentenceLimit)
      .map((sentence, index) => ({ index, sentence, score: 0 }));
  } else {
    selected = selected
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .slice(0, config.focusSummarySentenceLimit);
    selected.sort((a, b) => a.index - b.index);
  }

  const summary = selected
    .map((item) => item.sentence)
    .join(' ')
    .trim();
  if (summary.length <= config.focusSummaryCharBudget) return summary;
  const truncated = summary.slice(0, config.focusSummaryCharBudget);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace >= 0 ? truncated.slice(0, lastSpace) : truncated).trim();
}

export function shouldModelSummarize(responseText: string, config: AnalysisConfig): boolean {
  const normalized = normalizeText(responseText);
  if (normalized.length < config.focusSummaryMinResponseChars) return false;
  const lineCount = normalized.split('\n').filter((line) => line.trim()).length;
  return lineCount >= 4 || digitRatio(normalized) > 0.08;
}

export function buildAnalysisText(promptText: string, responseFocusText: string, fallbackText: string): string {
  const prompt = normalizeText(promptText);
  const focus = normalizeText(responseFocusText);
  if (prompt && focus) return `User intent: ${prompt}\nAssistant focus: ${focus}`;
  if (prompt) return prompt;
  if (focus) return focus;
  return normalizeText(fallbackText);
}

export function contextualizePromptText(
  promptText: string,
  previousContext: string,
  config: AnalysisConfig,
): string {
  const prompt = normalizeText(promptText);
  const context = normalizeText(previousContext);
  if (!prompt || !context) return prompt;

  const promptTokens = keywordTokens(prompt);
  const contextTokens = keywordTokens(context);
  if (promptTokens.size === 0 || contextTokens.size === 0) return prompt;

  let sharedCount = 0;
  for (const token of promptTokens) {
    if (contextTokens.has(token)) sharedCount += 1;
  }
  const overlap = sharedCount / Math.max(1, Math.min(promptTokens.size, contextTokens.size));

  let hasContextCue = CONTEXTUAL_PROMPT_PATTERN.test(prompt);
  if (!hasContextCue) {
    for (const token of promptTokens) {
      if (CONTEXTUAL_TOKENS.has(token)) {
        hasContextCue = true;
        break;
      }
    }
  }
  const shortOrSparse =
    prompt.length <= config.contextualPromptCharThreshold ||
    promptTokens.size <= config.contextualPromptKeywordThreshold;

  if (!hasContextCue) {
    if (!shortOrSparse) return prompt;
    if (overlap < config.contextualPromptImplicitOverlapThreshold) return prompt;
    if (overlap >= config.contextualPromptOverlapThreshold) return prompt;
  }

  if (!shortOrSparse && !hasContextCue) return prompt;

  let trimmedContext = context;
  if (trimmedContext.length > config.contextualPromptContextCharBudget) {
    const truncated = trimmedContext.slice(0, config.contextualPromptContextCharBudget);
    const lastSpace = truncated.lastIndexOf(' ');
    trimmedContext = (lastSpace >= 0 ? truncated.slice(0, lastSpace) : truncated).trim();
  }

  return `Context: ${trimmedContext}\nFollow-up: ${prompt}`;
}

export function mergeRoleText(parts: Sequence<string>): string {
  return parts
    .filter((part) => part && part.trim())
    .map((part) => part.trim())
    .join('\n\n');
}

type Sequence<T> = T[];
