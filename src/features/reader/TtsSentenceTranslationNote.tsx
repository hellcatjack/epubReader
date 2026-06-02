type TtsSentenceTranslationNoteProps = {
  fontScale?: number;
  left: number;
  readingCenterX?: number;
  width?: number;
  top: number;
  translation: string;
};

export function TtsSentenceTranslationNote({
  fontScale = 1,
  left,
  readingCenterX,
  width,
  top,
  translation,
}: TtsSentenceTranslationNoteProps) {
  return (
    <aside
      aria-label="Spoken sentence translation"
      className="reader-tts-sentence-note"
      data-reading-center-x={typeof readingCenterX === "number" ? String(readingCenterX) : undefined}
      data-translation-ready={translation.trim() ? "true" : "false"}
      role="status"
      style={{
        "--reader-tts-sentence-note-text-scale": String(fontScale),
        insetInlineStart: `${left}px`,
        top: `${top}px`,
        ...(typeof width === "number" ? { width: `${width}px` } : {}),
      } as React.CSSProperties}
    >
      <p className="reader-tts-sentence-note-text">{translation}</p>
    </aside>
  );
}
