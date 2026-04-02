import { describe, expect, it } from "vitest";
import {
  buildTtsSentenceTranslationCacheKey,
  extractCurrentSpokenSentence,
  isIgnorableSpokenSentence,
  normalizeSpokenSentence,
} from "./ttsSentenceTranslation";

describe("ttsSentenceTranslation helpers", () => {
  it("normalizes repeated whitespace and trims spoken sentences", () => {
    expect(normalizeSpokenSentence("  Nations   Descended from Noah.  ")).toBe("Nations Descended from Noah.");
  });

  it("treats numbering-only fragments as ignorable", () => {
    expect(isIgnorableSpokenSentence("10")).toBe(true);
    expect(isIgnorableSpokenSentence("1:1")).toBe(true);
    expect(isIgnorableSpokenSentence("[4]")).toBe(true);
  });

  it("keeps meaningful spoken sentences eligible for translation", () => {
    expect(isIgnorableSpokenSentence("These are the generations of the sons of Noah.")).toBe(false);
  });

  it("builds a stable cache key from book, spine item, and normalized sentence text", () => {
    expect(
      buildTtsSentenceTranslationCacheKey({
        bookId: "book-1",
        sentence: "  Nations   Descended from Noah. ",
        spineItemId: "chapter-10.xhtml",
      }),
    ).toBe("book-1::chapter-10.xhtml::Nations Descended from Noah.");
  });

  it("extracts the full sentence containing the current spoken offsets from the locator text", () => {
    expect(
      extractCurrentSpokenSentence({
        fallbackText: "generations",
        locatorText: "Nations Descended from Noah. These are the generations of the sons of Noah.",
        startOffset: 42,
      }),
    ).toBe("These are the generations of the sons of Noah.");
  });

  it("falls back to the current chunk text when no locator sentence can be resolved", () => {
    expect(
      extractCurrentSpokenSentence({
        fallbackText: "Nations Descended from Noah.",
        locatorText: "",
        startOffset: -1,
      }),
    ).toBe("Nations Descended from Noah.");
  });
});
