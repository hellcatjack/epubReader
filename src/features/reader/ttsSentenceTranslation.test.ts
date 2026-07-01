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

  it("extracts the bounded translation segment containing the current spoken offset", () => {
    const locatorText =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec " +
      "romeo sierra tango uniform victor whiskey xray yankee zulu and the line keeps going with many more words " +
      "that should not be translated all at once because the TTS side note should stay compact while reading";

    expect(
      extractCurrentSpokenSentence({
        fallbackText: "romeo",
        locatorText,
        startOffset: locatorText.indexOf("romeo"),
      }),
    ).toBe(
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor",
    );
  });

  it("keeps the same translation segment while spoken offsets remain in the same range", () => {
    const locatorText =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec " +
      "romeo sierra tango uniform victor whiskey xray yankee zulu and the line keeps going with many more words " +
      "that should not be translated all at once because the TTS side note should stay compact while reading";

    const firstSegment = extractCurrentSpokenSentence({
      fallbackText: "alpha",
      locatorText,
      startOffset: locatorText.indexOf("alpha"),
    });

    expect(
      extractCurrentSpokenSentence({
        fallbackText: "golf",
        locatorText,
        startOffset: locatorText.indexOf("golf"),
      }),
    ).toBe(firstSegment);
    expect(
      extractCurrentSpokenSentence({
        fallbackText: "romeo",
        locatorText,
        startOffset: locatorText.indexOf("romeo"),
      }),
    ).toBe(firstSegment);
  });

  it("moves to the next translation segment only after the spoken offset crosses the current range", () => {
    const locatorText =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec " +
      "romeo sierra tango uniform victor whiskey xray yankee zulu and the line keeps going with many more words " +
      "that should not be translated all at once because the TTS side note should stay compact while reading";

    expect(
      extractCurrentSpokenSentence({
        fallbackText: "because",
        locatorText,
        startOffset: locatorText.indexOf("because"),
      }),
    ).toBe(
      "whiskey xray yankee zulu and the line keeps going with many more words that should not be translated all at once because the TTS side note",
    );
  });

  it("limits fallback chunk text when no locator segment can be resolved", () => {
    const fallbackText =
      "Nations Descended from Noah and the line keeps going with many more words that should not be translated " +
      "all at once because the TTS side note should stay compact while reading";

    expect(
      extractCurrentSpokenSentence({
        fallbackText,
        locatorText: "",
        startOffset: -1,
      }),
    ).toBe(
      "Nations Descended from Noah and the line keeps going with many more words that should not be translated all at once because the TTS side",
    );
  });
});
