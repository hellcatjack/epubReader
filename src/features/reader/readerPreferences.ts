import type { ReadingMode, SettingsInput } from "../../lib/types/settings";

export type ReaderPreferences = Pick<
  SettingsInput,
  | "columnCount"
  | "contentPadding"
  | "fontFamily"
  | "fontScale"
  | "letterSpacing"
  | "lineHeight"
  | "maxLineWidth"
  | "paragraphIndent"
  | "paragraphSpacing"
  | "readingMode"
  | "theme"
>;

export const defaultReaderPreferences: ReaderPreferences = {
  columnCount: 1,
  contentPadding: 32,
  fontFamily: "book",
  fontScale: 1,
  letterSpacing: 0,
  lineHeight: 1.7,
  maxLineWidth: 760,
  paragraphIndent: 1.8,
  paragraphSpacing: 0.85,
  readingMode: "scrolled",
  theme: "sepia",
};

export function getEffectiveReaderPreferences(preferences: ReaderPreferences): ReaderPreferences {
  if (preferences.readingMode !== "paginated") {
    return preferences;
  }

  return {
    ...preferences,
    columnCount: 1,
  };
}

export function resolveReaderFontFamily(fontFamily: ReaderPreferences["fontFamily"]) {
  if (fontFamily === "sans") {
    return '"Atkinson Hyperlegible", "Segoe UI", sans-serif';
  }

  if (fontFamily === "serif") {
    return '"Source Serif 4", Georgia, serif';
  }

  return '"Iowan Old Style", Georgia, serif';
}

export function buildReaderTheme(preferences: ReaderPreferences) {
  const effectivePreferences = getEffectiveReaderPreferences(preferences);
  const columnGap = Math.max(effectivePreferences.contentPadding, 32);
  const fontSize = `${Math.round(effectivePreferences.fontScale * 100)}%`;
  const imagePagePadding = `${Math.min(effectivePreferences.contentPadding, 16)}px`;

  return {
    html: {
      "font-size": fontSize,
    },
    body: {
      "box-sizing": "border-box",
      "column-count": String(effectivePreferences.columnCount),
      "column-gap": `${columnGap}px`,
      "font-family": resolveReaderFontFamily(effectivePreferences.fontFamily),
      "font-size": fontSize,
      "letter-spacing": `${effectivePreferences.letterSpacing}em`,
      "line-height": String(effectivePreferences.lineHeight),
      "margin": "0 auto",
      "max-width": `${effectivePreferences.maxLineWidth}px`,
      "padding": `${effectivePreferences.contentPadding}px`,
    },
    "body.reader-image-page": {
      "max-width": "none !important",
      "padding": `${imagePagePadding} !important`,
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
    p: {
      "margin-bottom": `${effectivePreferences.paragraphSpacing}em`,
      "margin-top": "0",
      "text-indent": `${effectivePreferences.paragraphIndent}em`,
    },
    "p:first-child": {
      "text-indent": "0",
    },
    ".reader-tts-active-segment": {
      "background": "linear-gradient(90deg, rgba(186, 106, 47, 0.16) 0, rgba(186, 106, 47, 0.16) 100%)",
      "background-repeat": "no-repeat",
      "border-radius": "0.45rem",
      "box-shadow": "inset 0 0 0 1px rgba(186, 106, 47, 0.24)",
      "padding-left": "0",
      "scroll-margin-top": "18vh",
      "transition": "none",
    },
  };
}

export function toReaderPreferences(settings: Partial<SettingsInput>): ReaderPreferences {
  return {
    ...defaultReaderPreferences,
    ...settings,
  };
}

export function toEpubFlow(readingMode: ReadingMode) {
  return readingMode === "scrolled" ? "scrolled-doc" : "paginated";
}
