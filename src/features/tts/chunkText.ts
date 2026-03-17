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
  spineItemId?: string;
  text: string;
};

export type ChunkMarker = {
  cfi?: string;
  end: number;
  spineItemId?: string;
  start: number;
  text: string;
};

export type ChunkSegment = {
  markers: ChunkMarker[];
  text: string;
};

function normalizeParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeBlocks(blocks: Array<string | ChunkBlock>) {
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
    .filter((block) => block.text);
}

function blocksToUnits(blocks: Array<string | ChunkBlock>, maxCharacters: number) {
  return normalizeBlocks(blocks).flatMap((block) => {
    if (block.text.length <= maxCharacters) {
      return [block];
    }

    return splitIntoSentences(block.text).flatMap((sentence) => {
      if (sentence.length <= maxCharacters) {
        return [
          {
            ...block,
            text: sentence,
          },
        ];
      }

      return splitOversizedSentence(sentence, maxCharacters).map((text) => ({
        ...block,
        text,
      }));
    });
  });
}

function joinUnits(units: ChunkBlock[], maxCharacters: number) {
  let current = "";
  let consumed = 0;
  const segmentUnits: ChunkBlock[] = [];

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
        spineItemId: unit.spineItemId,
        start,
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
