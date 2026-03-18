type AiResultPanelProps = {
  error?: string;
  ipa?: string;
  result?: string;
  selectedText?: string;
  title?: string;
};

export function AiResultPanel({
  error,
  ipa,
  result,
  selectedText,
  title = "AI result",
}: AiResultPanelProps) {
  const isTranslation = title === "Translation";
  const showMeta = Boolean(selectedText || (isTranslation && ipa));

  return (
    <section className="reader-panel reader-ai-panel" aria-label="AI result">
      <h2>{title}</h2>
      {showMeta ? (
        <div className="reader-ai-meta">
          {selectedText ? (
            <div className="reader-ai-meta-row">
              <span className="reader-ai-label">Selection</span>
              <span className="reader-ai-value">{selectedText}</span>
            </div>
          ) : null}
          {isTranslation && ipa ? (
            <div className="reader-ai-meta-row">
              <span className="reader-ai-label">IPA</span>
              <span className="reader-ai-value">{ipa}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="reader-ai-result">
        <p>{result ? result : "Select text to translate or explain it in context."}</p>
      </div>
      {error ? <p className="reader-ai-error">{error}</p> : null}
    </section>
  );
}
