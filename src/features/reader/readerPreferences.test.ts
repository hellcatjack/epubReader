import { describe, expect, it } from "vitest";
import { buildReaderTheme, toEpubFlow } from "./readerPreferences";

describe("readerPreferences", () => {
  it("maps reader modes to epub rendition flow values", () => {
    expect(toEpubFlow("scrolled")).toBe("scrolled-doc");
    expect(toEpubFlow("paginated")).toBe("paginated");
  });

  it("builds epub theme rules for advanced typography controls", () => {
    expect(
      buildReaderTheme({
        columnCount: 2,
        contentPadding: 40,
        fontFamily: "book",
        fontScale: 1.15,
        letterSpacing: 0.03,
        lineHeight: 1.9,
        maxLineWidth: 780,
        paragraphIndent: 2,
        paragraphSpacing: 1.1,
        readingMode: "paginated",
        theme: "sepia",
      }),
    ).toMatchObject({
      body: {
        "column-count": "2",
        "column-gap": "40px",
        "font-family": '"Iowan Old Style", Georgia, serif',
        "font-size": "115%",
        "letter-spacing": "0.03em",
        "line-height": "1.9",
        "margin": "0 auto",
        "max-width": "780px",
        "padding": "40px",
      },
      p: {
        "margin-bottom": "1.1em",
        "margin-top": "0",
        "text-indent": "2em",
      },
      "p:first-child": {
        "text-indent": "0",
      },
      ".reader-tts-active-segment": {
        "background": "linear-gradient(90deg, transparent 0, transparent 0.65rem, rgba(186, 106, 47, 0.72) 0.65rem, rgba(186, 106, 47, 0.72) 0.87rem, transparent 0.87rem, transparent 100%)",
        "background-repeat": "no-repeat",
        "box-shadow": "none",
        "padding-left": "0",
        "transition": "none",
      },
    });
  });
});
