const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'of',
  'for',
  'is',
  'it',
  'that',
  'this',
  'what',
  'how',
  'can',
  'you',
  'your',
  'with',
  'into',
  'from',
  'any',
  'all',
  'there',
  'like',
  'just',
  'need',
  'give',
  'me',
]);

const GENERIC_PARTS = new Set([
  'yes',
  'need',
  'like',
  'clean',
  'buy',
  'hat',
  'pedal',
  'push',
  'pow',
  'gm',
  'vs',
]);

function normalizeSpacing(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function titleCase(text: string): string {
  return text
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function compactPrompt(promptText?: string): string | null {
  if (!promptText) {
    return null;
  }

  const normalized = normalizeSpacing(
    promptText
      .replace(/[?!.]+$/g, '')
      .replace(/\bhi hat\b/gi, 'hi-hat')
      .replace(/[^\w\s/-]+/g, ' '),
  );

  if (!normalized) {
    return null;
  }

  const tokens = normalized.split(' ');
  const meaningful = tokens.filter((token) => !STOPWORDS.has(token.toLowerCase()));
  const chosen = meaningful.length >= 3 ? meaningful : tokens;
  return titleCase(chosen.slice(0, 7).join(' '));
}

function labelLooksWeak(label: string): boolean {
  const normalized = normalizeSpacing(label.toLowerCase());
  if (!normalized) {
    return true;
  }
  if (normalized.length < 14) {
    return true;
  }

  const parts = normalized.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return true;
  }

  const genericParts = parts.filter((part) => GENERIC_PARTS.has(part) || part.length <= 3);
  return genericParts.length >= Math.ceil(parts.length / 2);
}

export function displayTopicLabel(rawLabel: string, promptText?: string): string {
  const normalized = normalizeSpacing(rawLabel.replace(/\bhi hat\b/gi, 'hi-hat'));
  const promptLabel = compactPrompt(promptText);
  if (labelLooksWeak(normalized) && promptLabel) {
    return promptLabel;
  }
  return titleCase(normalized);
}

export function displayRootTopicLabel(rawLabel: string, promptText?: string): string {
  const promptLabel = compactPrompt(promptText);
  if (promptLabel) {
    return promptLabel;
  }
  return displayTopicLabel(rawLabel, promptText);
}
