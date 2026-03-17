function splitIntoSentences(paragraph: string) {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitOversizedSentence(sentence: string, maxCharacters: number) {
  const words = sentence.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    current = word;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

type ChunkOptions = {
  firstSegmentMax?: number;
  segmentMax?: number;
};

function normalizeParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function toUnits(text: string, maxCharacters: number) {
  const paragraphs = text
    ? normalizeParagraphs(text)
    : [];

  return paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= maxCharacters) {
      return [paragraph];
    }

    return splitIntoSentences(paragraph).flatMap((sentence) => {
      if (sentence.length <= maxCharacters) {
        return [sentence];
      }

      return splitOversizedSentence(sentence, maxCharacters);
    });
  });
}

function joinUnits(units: string[], maxCharacters: number) {
  let current = "";
  let consumed = 0;

  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      consumed += 1;
      continue;
    }
    break;
  }

  return {
    consumed,
    segment: current,
  };
}

export function chunkText(text: string, options: number | ChunkOptions = {}) {
  const normalizedOptions =
    typeof options === "number"
      ? { firstSegmentMax: options, segmentMax: options }
      : options;
  const firstSegmentMax = normalizedOptions.firstSegmentMax ?? 280;
  const segmentMax = normalizedOptions.segmentMax ?? Math.max(firstSegmentMax, 500);
  const paragraphUnits = toUnits(text, segmentMax);
  const segments: string[] = [];
  let index = 0;

  while (index < paragraphUnits.length) {
    const maxCharacters = segments.length === 0 ? firstSegmentMax : segmentMax;
    const { consumed, segment } = joinUnits(paragraphUnits.slice(index), maxCharacters);

    if (!segment || consumed === 0) {
      break;
    }

    segments.push(segment);
    index += consumed;
  }

  return segments;
}
