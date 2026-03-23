import { describe, expect, it } from "vitest";
import { buildReaderTheme, getEffectiveReaderPreferences, toEpubFlow } from "./readerPreferences";

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
        contentBackgroundColor: "#c0ffee",
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
        "background-color": "#c0ffee",
        "column-count": "1",
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
      "body.reader-image-page": {
        "max-width": "none !important",
        "padding": "16px !important",
      },
      "body.reader-image-page .figure_nomargin, body.reader-image-page .figure, body.reader-image-page .figure_cover, body.reader-image-page .figure_fullpage, body.reader-image-page .figure_fullpage_caption, body.reader-image-page .squeeze, body.reader-image-page .squeeze100, body.reader-image-page .squeeze90": {
        "margin": "0 auto !important",
        "max-width": "100% !important",
        "width": "100% !important",
      },
      "body.reader-image-page img, body.reader-image-page svg": {
        "display": "block",
        "height": "auto !important",
        "margin": "0 auto !important",
        "max-width": "100% !important",
        "width": "100% !important",
      },
      ".reader-tts-active-segment": {
        "background": "linear-gradient(90deg, rgba(186, 106, 47, 0.16) 0, rgba(186, 106, 47, 0.16) 100%)",
        "background-repeat": "no-repeat",
        "box-shadow": "inset 0 0 0 1px rgba(186, 106, 47, 0.24)",
        "padding-left": "0",
        "transition": "none",
      },
    });
  });

  it("forces a single rendered column in paginated mode", () => {
    expect(
      getEffectiveReaderPreferences({
        columnCount: 2,
        contentPadding: 40,
        contentBackgroundColor: "#f6edde",
        fontFamily: "book",
        fontScale: 1.15,
        letterSpacing: 0.03,
        lineHeight: 1.9,
        maxLineWidth: 780,
        paragraphIndent: 2,
        paragraphSpacing: 1.1,
        readingMode: "paginated",
        theme: "sepia",
      }).columnCount,
    ).toBe(1);
  });

  it("widens the scrolled reading surface by 200px without changing paginated width", () => {
    expect(
      buildReaderTheme({
        columnCount: 1,
        contentPadding: 32,
        contentBackgroundColor: "#f6edde",
        fontFamily: "book",
        fontScale: 1,
        letterSpacing: 0,
        lineHeight: 1.7,
        maxLineWidth: 760,
        paragraphIndent: 1.8,
        paragraphSpacing: 0.85,
        readingMode: "scrolled",
        theme: "sepia",
      }).body["max-width"],
    ).toBe("960px");

    expect(
      buildReaderTheme({
        columnCount: 1,
        contentPadding: 32,
        contentBackgroundColor: "#f6edde",
        fontFamily: "book",
        fontScale: 1,
        letterSpacing: 0,
        lineHeight: 1.7,
        maxLineWidth: 760,
        paragraphIndent: 1.8,
        paragraphSpacing: 0.85,
        readingMode: "paginated",
        theme: "sepia",
      }).body["max-width"],
    ).toBe("760px");
  });
});
