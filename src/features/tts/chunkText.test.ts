import { describe, expect, it } from "vitest";
import { chunkText, chunkTextSegmentsFromBlocks } from "./chunkText";

describe("chunkText", () => {
  it("keeps short paragraphs together in the first segment", () => {
    expect(chunkText("One.\n\nTwo.\n\nThree.", { firstSegmentMax: 80, segmentMax: 120 })).toEqual([
      "One. Two. Three.",
    ]);
  });

  it("keeps a smaller first segment and larger later segments", () => {
    const text = [
      "First paragraph opens the reading queue with a tight chunk to reduce time to first audio.",
      "Second paragraph adds enough text that later segments should be allowed to grow larger than the first.",
      "Third paragraph continues the story so the queue can keep streaming without sentence sized requests.",
    ].join("\n\n");
    const chunks = chunkText(text, { firstSegmentMax: 90, segmentMax: 180 });

    expect(chunks[0]?.length ?? 0).toBeLessThanOrEqual(90);
    expect(chunks[1]?.length ?? 0).toBeLessThanOrEqual(180);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("falls back to sentence chunks for oversized paragraphs", () => {
    expect(chunkText("One paragraph.\n\nTwo paragraph.", { firstSegmentMax: 120, segmentMax: 120 })).toEqual([
      "One paragraph. Two paragraph.",
    ]);
    expect(chunkText("First sentence. Second sentence. Third sentence.", { firstSegmentMax: 20, segmentMax: 20 })).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third sentence.",
    ]);
  });

  it("preserves source offsets for oversized sentence markers inside the original block", () => {
    const segments = chunkTextSegmentsFromBlocks(
      [
        {
          cfi: "epubcfi(/6/2!/4/2/1:0)",
          text: "Alpha beta beta gamma",
        },
      ],
      { firstSegmentMax: 10, segmentMax: 10 },
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]?.markers[0]).toMatchObject({
      sourceStart: 0,
      sourceEnd: "Alpha beta".length,
      text: "Alpha beta",
    });
    expect(segments[1]?.markers[0]).toMatchObject({
      sourceStart: "Alpha beta ".length,
      sourceEnd: "Alpha beta beta gamma".length,
      text: "beta gamma",
    });
  });
});
