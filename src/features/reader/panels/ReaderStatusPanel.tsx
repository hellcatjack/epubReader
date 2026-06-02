type ReaderStatusPanelProps = {
  selectedText?: string;
  status?: string;
};

export function ReaderStatusPanel({
  selectedText,
  status = "Open a book from the shelf to start reading.",
}: ReaderStatusPanelProps) {
  return (
    <section className="reader-panel reader-panel-muted" aria-label="Reading session">
      <h2>Reading session</h2>
      <p className="reader-status">{status}</p>
      {selectedText ? <p className="reader-selection-preview">Selection: {selectedText}</p> : null}
    </section>
  );
}
