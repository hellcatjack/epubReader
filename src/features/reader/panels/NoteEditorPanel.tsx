type NoteEditorPanelProps = {
  isOpen?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
  selectedText?: string;
  value?: string;
};

export function NoteEditorPanel({
  isOpen = false,
  onChange,
  onSave,
  selectedText,
  value = "",
}: NoteEditorPanelProps) {
  return (
    <section className="reader-panel">
      <h2>Note draft</h2>
      {isOpen ? (
        <>
          {selectedText ? <p>{selectedText}</p> : null}
          <label>
            Note body
            <textarea
              aria-label="Note body"
              className="reader-note-input"
              onChange={(event) => onChange?.(event.target.value)}
              rows={6}
              value={value}
            />
          </label>
          <button className="reader-secondary-button" onClick={onSave} type="button">
            Save note
          </button>
        </>
      ) : (
        <p>Create a note from the current selection and keep it pinned to this passage.</p>
      )}
    </section>
  );
}
