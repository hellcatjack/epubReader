const actions = ["Translate", "Explain", "Highlight", "Add note", "Read aloud"];

export function SelectionPopover() {
  return (
    <section className="selection-popover" aria-label="Selection actions">
      {actions.map((action) => (
        <button key={action} className="selection-action" type="button">
          {action}
        </button>
      ))}
    </section>
  );
}
