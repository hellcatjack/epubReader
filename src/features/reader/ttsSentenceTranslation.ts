const numberOnlyPattern = /^(?:\d+(?::\d+)?|\[\d+\])$/;
const sentenceTerminatorPattern = /[.!?。！？]/;

export function normalizeSpokenSentence(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function isIgnorableSpokenSentence(text: string) {
  const normalized = normalizeSpokenSentence(text);
  if (!normalized) {
    return true;
  }

  return numberOnlyPattern.test(normalized);
}

export function buildTtsSentenceTranslationCacheKey({
  bookId,
  sentence,
  spineItemId,
}: {
  bookId: string;
  sentence: string;
  spineItemId: string;
}) {
  return `${bookId}::${spineItemId}::${normalizeSpokenSentence(sentence)}`;
}

export function extractCurrentSpokenSentence({
  fallbackText,
  locatorText,
  startOffset,
}: {
  fallbackText: string;
  locatorText?: string;
  startOffset?: number;
}) {
  const normalizedLocator = normalizeSpokenSentence(locatorText ?? "");
  if (!normalizedLocator) {
    return normalizeSpokenSentence(fallbackText);
  }

  const safeOffset = Math.max(0, Math.min(startOffset ?? -1, Math.max(0, normalizedLocator.length - 1)));
  if (typeof startOffset !== "number" || startOffset < 0) {
    return normalizeSpokenSentence(fallbackText);
  }

  let sentenceStart = safeOffset;
  while (sentenceStart > 0 && !sentenceTerminatorPattern.test(normalizedLocator[sentenceStart - 1] ?? "")) {
    sentenceStart -= 1;
  }

  while (sentenceStart < normalizedLocator.length && /\s/.test(normalizedLocator[sentenceStart] ?? "")) {
    sentenceStart += 1;
  }

  let sentenceEnd = safeOffset;
  while (sentenceEnd < normalizedLocator.length && !sentenceTerminatorPattern.test(normalizedLocator[sentenceEnd] ?? "")) {
    sentenceEnd += 1;
  }

  if (sentenceEnd < normalizedLocator.length) {
    sentenceEnd += 1;
  }

  const candidate = normalizeSpokenSentence(normalizedLocator.slice(sentenceStart, sentenceEnd));
  return candidate || normalizeSpokenSentence(fallbackText);
}
