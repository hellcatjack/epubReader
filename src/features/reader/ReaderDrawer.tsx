import { useEffect, type KeyboardEvent, type PropsWithChildren } from "react";

type ReaderDrawerProps = PropsWithChildren<{
  eyebrow: string;
  onClose: () => void;
  open: boolean;
  side: "left" | "right";
  title: string;
  label: string;
}>;

export function ReaderDrawer({ children, eyebrow, label, onClose, open, side, title }: ReaderDrawerProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent | globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="reader-drawer-backdrop" data-side={side} onClick={onClose} role="presentation">
      <aside
        aria-label={label}
        aria-modal="true"
        className="reader-drawer"
        data-side={side}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="reader-drawer-header">
          <div>
            <p className="reader-drawer-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button className="reader-shell-action-button" onClick={onClose} type="button">
            {`Close ${eyebrow.toLowerCase()}`}
          </button>
        </div>
        <div className="reader-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
