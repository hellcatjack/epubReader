type TtsSentenceTranslationNoteProps = {
  fontScale?: number;
  label?: string;
  left: number;
  width?: number;
  top: number;
  translation: string;
};

export function TtsSentenceTranslationNote({
  fontScale = 1,
  label = "Now reading",
  left,
  width,
  top,
  translation,
}: TtsSentenceTranslationNoteProps) {
  return (
    <aside
      aria-label="Spoken sentence translation"
      className="reader-tts-sentence-note"
      role="status"
      style={{
        "--reader-tts-sentence-note-text-scale": String(fontScale),
        insetInlineStart: `${left}px`,
        top: `${top}px`,
        ...(typeof width === "number" ? { width: `${width}px` } : {}),
      } as React.CSSProperties}
    >
      <span className="reader-tts-sentence-note-label">{label}</span>
      <p className="reader-tts-sentence-note-text">{translation}</p>
    </aside>
  );
}
