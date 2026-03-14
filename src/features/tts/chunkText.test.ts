import { describe, expect, it } from "vitest";
import { chunkText } from "./chunkText";

describe("chunkText", () => {
  it("splits text by paragraph first and falls back to sentence chunks for oversized paragraphs", () => {
    expect(chunkText("One paragraph.\n\nTwo paragraph.", 120)).toEqual(["One paragraph.", "Two paragraph."]);
    expect(chunkText("First sentence. Second sentence. Third sentence.", 20)).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third sentence.",
    ]);
  });
});
