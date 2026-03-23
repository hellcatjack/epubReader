import type { ComponentPropsWithoutRef } from "react";

type SelectionPopoverProps = {
  className?: string;
  hasSelection?: boolean;
  onAddNote?: () => void;
  onExplain?: () => void;
  onHighlight?: () => void;
  onReadAloud?: () => void;
  onTranslate?: () => void;
} & Omit<ComponentPropsWithoutRef<"div">, "onAddNote" | "onExplain" | "onHighlight" | "onReadAloud" | "onTranslate">;

export function SelectionPopover({
  className,
  hasSelection = false,
  onAddNote,
  onExplain,
  onHighlight,
  onReadAloud,
  onTranslate,
  ...props
}: SelectionPopoverProps) {
  return (
    <div
      aria-label="Selection actions"
      className={["selection-popover", className].filter(Boolean).join(" ")}
      role="group"
      {...props}
    >
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
    </div>
  );
}
