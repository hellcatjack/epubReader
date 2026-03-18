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
  return (
    <section className="reader-panel" aria-label="AI result">
      <h2>{title}</h2>
      {selectedText ? <p>Selection: {selectedText}</p> : null}
      {title === "Translation" && ipa ? <p>IPA: {ipa}</p> : null}
      {result ? <p>{result}</p> : <p>Select text to translate or explain it in context.</p>}
      {error ? <p>{error}</p> : null}
    </section>
  );
}
