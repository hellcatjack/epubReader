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

export type ChunkBlock = {
  cfi?: string;
  locatorText?: string;
  sourceEnd?: number;
  sourceStart?: number;
  spineItemId?: string;
  text: string;
};

export type ChunkMarker = {
  cfi?: string;
  end: number;
  locatorText?: string;
  spineItemId?: string;
  start: number;
  sourceEnd?: number;
  sourceStart?: number;
  text: string;
};

export type ChunkSegment = {
  markers: ChunkMarker[];
  text: string;
};

type ChunkUnit = ChunkBlock & {
  sourceEnd: number;
  sourceStart: number;
};

function normalizeParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeBlocks(blocks: Array<string | ChunkBlock>): ChunkUnit[] {
  return blocks
    .map((block) =>
      typeof block === "string"
        ? {
            text: block.replace(/\s+/g, " ").trim(),
          }
        : {
            ...block,
            text: block.text.replace(/\s+/g, " ").trim(),
          },
    )
    .filter((block) => block.text)
    .map((block) => ({
      ...block,
      locatorText: block.locatorText ?? block.text,
      sourceEnd:
        typeof block.sourceEnd === "number"
          ? block.sourceEnd
          : (typeof block.sourceStart === "number" ? block.sourceStart : 0) + block.text.length,
      sourceStart: typeof block.sourceStart === "number" ? block.sourceStart : 0,
    }));
}

function splitBlockIntoUnits(block: ChunkUnit, maxCharacters: number): ChunkUnit[] {
  if (block.text.length <= maxCharacters) {
    return [block];
  }

  const sentences = splitIntoSentences(block.text);
  let blockCursor = 0;

  return sentences.flatMap((sentence) => {
    const sentenceStart = block.text.indexOf(sentence, blockCursor);
    const resolvedSentenceStart = sentenceStart >= 0 ? sentenceStart : blockCursor;
    const sentenceEnd = resolvedSentenceStart + sentence.length;
    blockCursor = sentenceEnd;

    if (sentence.length <= maxCharacters) {
      return [
        {
          ...block,
          sourceEnd: block.sourceStart + sentenceEnd,
          sourceStart: block.sourceStart + resolvedSentenceStart,
          text: sentence,
        },
      ];
    }

    const oversizedUnits = splitOversizedSentence(sentence, maxCharacters);
    let sentenceCursor = resolvedSentenceStart;

    return oversizedUnits.map((unitText) => {
      const unitStart = block.text.indexOf(unitText, sentenceCursor);
      const resolvedUnitStart = unitStart >= 0 ? unitStart : sentenceCursor;
      const unitEnd = resolvedUnitStart + unitText.length;
      sentenceCursor = unitEnd;

      return {
        ...block,
        sourceEnd: block.sourceStart + unitEnd,
        sourceStart: block.sourceStart + resolvedUnitStart,
        text: unitText,
      };
    });
  });
}

function blocksToUnits(blocks: Array<string | ChunkBlock>, maxCharacters: number) {
  return normalizeBlocks(blocks).flatMap((block) => splitBlockIntoUnits(block, maxCharacters));
}

function joinUnits(units: ChunkUnit[], maxCharacters: number) {
  let current = "";
  let consumed = 0;
  const segmentUnits: ChunkUnit[] = [];

  for (const unit of units) {
    const candidate = current ? `${current} ${unit.text}` : unit.text;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      consumed += 1;
      segmentUnits.push(unit);
      continue;
    }
    break;
  }

  return {
    consumed,
    units: segmentUnits,
    segment: current,
  };
}

export function chunkTextSegmentsFromBlocks(
  blocks: Array<string | ChunkBlock>,
  options: number | ChunkOptions = {},
): ChunkSegment[] {
  const normalizedOptions =
    typeof options === "number"
      ? { firstSegmentMax: options, segmentMax: options }
      : options;
  const firstSegmentMax = normalizedOptions.firstSegmentMax ?? 280;
  const segmentMax = normalizedOptions.segmentMax ?? Math.max(firstSegmentMax, 500);
  const paragraphUnits = blocksToUnits(blocks, segmentMax);
  const segments: ChunkSegment[] = [];
  let index = 0;

  while (index < paragraphUnits.length) {
    const maxCharacters = segments.length === 0 ? firstSegmentMax : segmentMax;
    const { consumed, segment, units } = joinUnits(paragraphUnits.slice(index), maxCharacters);

    if (!segment || consumed === 0) {
      break;
    }

    let cursor = 0;
    const markers = units.map((unit) => {
      const start = cursor;
      const end = cursor + unit.text.length;
      cursor = end + 1;
      return {
        cfi: unit.cfi,
        end,
        locatorText: unit.locatorText,
        spineItemId: unit.spineItemId,
        start,
        sourceEnd: unit.sourceEnd,
        sourceStart: unit.sourceStart,
        text: unit.text,
      };
    });

    segments.push({
      markers,
      text: segment,
    });
    index += consumed;
  }

  return segments;
}

export function chunkTextSegments(text: string, options: number | ChunkOptions = {}): ChunkSegment[] {
  return chunkTextSegmentsFromBlocks(text ? normalizeParagraphs(text) : [], options);
}

export function chunkText(text: string, options: number | ChunkOptions = {}) {
  return chunkTextSegments(text, options).map((segment) => segment.text);
}
