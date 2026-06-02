import type { ComponentPropsWithoutRef } from "react";

type SelectionPopoverProps = {
  className?: string;
  hasSelection?: boolean;
  onExplain?: () => void;
  onReadAloud?: () => void;
  onTranslate?: () => void;
  showReadAloud?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "onExplain" | "onReadAloud" | "onTranslate">;

export function SelectionPopover({
  className,
  hasSelection = false,
  onExplain,
  onReadAloud,
  onTranslate,
  showReadAloud = true,
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
      {showReadAloud ? (
        <button className="selection-action" disabled={!hasSelection} onClick={onReadAloud} type="button">
          Read aloud
        </button>
      ) : null}
    </div>
  );
}
