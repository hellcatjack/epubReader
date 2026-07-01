const numberOnlyPattern = /^(?:\d+(?::\d+)?|\[\d+\])$/;
const segmentBoundaryPattern = /[\s,，、;；:：.!?。！？()[\]{}"“”'‘’]/;
const spokenTranslationSegmentMaxLength = 140;
const spokenTranslationSoftMinimumLength = 80;

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

function clampOffset(offset: number, length: number) {
  return Math.max(0, Math.min(offset, Math.max(0, length - 1)));
}

function findCurrentWordStart(text: string, offset: number) {
  let start = clampOffset(offset, text.length);

  while (start > 0 && !segmentBoundaryPattern.test(text[start - 1] ?? "")) {
    start -= 1;
  }

  return start;
}

function findSegmentEnd(text: string, start: number) {
  const hardEnd = Math.min(text.length, start + spokenTranslationSegmentMaxLength);
  if (hardEnd >= text.length) {
    return text.length;
  }

  const minimumSoftEnd = Math.min(hardEnd, start + spokenTranslationSoftMinimumLength);
  for (let end = hardEnd; end > minimumSoftEnd; end -= 1) {
    if (segmentBoundaryPattern.test(text[end] ?? "")) {
      return end;
    }
  }

  return hardEnd;
}

function extractBoundedSpokenSegment(text: string, startOffset = 0) {
  const normalized = normalizeSpokenSentence(text);
  if (!normalized) {
    return "";
  }

  const start = findCurrentWordStart(normalized, startOffset);
  const end = findSegmentEnd(normalized, start);
  return normalizeSpokenSentence(normalized.slice(start, end)) || normalized.slice(start, start + spokenTranslationSegmentMaxLength);
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
    return extractBoundedSpokenSegment(fallbackText);
  }

  if (typeof startOffset !== "number" || startOffset < 0) {
    return extractBoundedSpokenSegment(fallbackText);
  }

  const candidate = extractBoundedSpokenSegment(normalizedLocator, startOffset);
  return candidate || extractBoundedSpokenSegment(fallbackText);
}
