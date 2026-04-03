type AiResultPanelProps = {
  explanation?: string;
  explanationError?: string;
  ipa?: string;
  onReadAloud?: () => void;
  selectedText?: string;
  translation?: string;
  translationError?: string;
};

export function AiResultPanel({
  explanation,
  explanationError,
  ipa,
  onReadAloud,
  selectedText,
  translation,
  translationError,
}: AiResultPanelProps) {
  const showMeta = Boolean(selectedText || ipa);
  const translationText = translation || "Select text to translate or explain it in context.";
  const explanationText = explanation || "Click Explain for deeper context.";

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
      <section className="reader-ai-surface reader-ai-surface-secondary" aria-label="Explanation result">
        <h3>Explanation</h3>
        {explanationError ? (
          <p className="reader-ai-section-error">{explanationError}</p>
        ) : (
          <p className={explanation ? undefined : "reader-ai-placeholder"}>{explanationText}</p>
        )}
      </section>
    </section>
  );
}
