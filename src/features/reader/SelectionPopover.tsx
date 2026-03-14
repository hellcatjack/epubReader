type SelectionPopoverProps = {
  hasSelection?: boolean;
  onAddNote?: () => void;
  onExplain?: () => void;
  onHighlight?: () => void;
  onReadAloud?: () => void;
  onTranslate?: () => void;
};

export function SelectionPopover({
  hasSelection = false,
  onAddNote,
  onExplain,
  onHighlight,
  onReadAloud,
  onTranslate,
}: SelectionPopoverProps) {
  return (
    <section className="selection-popover" aria-label="Selection actions">
      <button className="selection-action" disabled={!hasSelection} onClick={onTranslate} type="button">
        Translate
      </button>
      <button className="selection-action" disabled={!hasSelection} onClick={onExplain} type="button">
        Explain
      </button>
      <button className="selection-action" disabled={!hasSelection} onClick={onHighlight} type="button">
        Highlight
      </button>
      <button className="selection-action" disabled={!hasSelection} onClick={onAddNote} type="button">
        Add note
      </button>
      <button className="selection-action" disabled={!hasSelection} onClick={onReadAloud} type="button">
        Read aloud
      </button>
    </section>
  );
}
