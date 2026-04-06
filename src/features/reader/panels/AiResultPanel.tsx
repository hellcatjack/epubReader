type AiResultPanelProps = {
  ipa?: string;
  onReadAloud?: () => void;
  selectedText?: string;
  translation?: string;
  translationError?: string;
};

export function AiResultPanel({
  ipa,
  onReadAloud,
  selectedText,
  translation,
  translationError,
}: AiResultPanelProps) {
  const showMeta = Boolean(selectedText || ipa);
  const translationText = translation || "Select text to translate it in context.";

  return (
    <section className="reader-panel reader-ai-panel" aria-label="AI result">
      <h2>Reading assistant</h2>
      {showMeta ? (
        <div className="reader-ai-meta">
          {selectedText ? (
            <div className="reader-ai-meta-row">
              <div className="reader-ai-meta-main">
                <span className="reader-ai-label">Selection</span>
                <span className="reader-ai-value">{selectedText}</span>
              </div>
              <button
                aria-label="Read selection aloud"
                className="reader-ai-inline-action"
                onClick={onReadAloud}
                type="button"
              >
                Play
              </button>
            </div>
          ) : null}
          {ipa ? (
            <div className="reader-ai-meta-row">
              <div className="reader-ai-meta-main">
                <span className="reader-ai-label">IPA</span>
                <span className="reader-ai-value">{ipa}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <section className="reader-ai-surface reader-ai-surface-primary" aria-label="Translation result">
        <h3>Translation</h3>
        {translationError ? (
          <p className="reader-ai-section-error">{translationError}</p>
        ) : (
          <p className={translation ? undefined : "reader-ai-placeholder"}>{translationText}</p>
        )}
      </section>
    </section>
  );
}
