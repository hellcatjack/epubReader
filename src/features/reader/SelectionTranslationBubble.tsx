import type { CSSProperties } from "react";
import type { ReaderSelectionRect } from "./selectionBridge";

type SelectionTranslationBubbleProps = {
  anchorRect: ReaderSelectionRect;
  translation: string;
};

const bubbleWidth = 320;
const bubbleHeight = 72;
const viewportInset = 16;
const bubbleOffset = 12;

function buildBubbleStyle(anchorRect: ReaderSelectionRect): CSSProperties {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const preferredLeft = anchorRect.left + anchorRect.width / 2 - bubbleWidth / 2;
  const left = Math.max(viewportInset, Math.min(preferredLeft, viewportWidth - bubbleWidth - viewportInset));
  const canPlaceBelow = anchorRect.bottom + bubbleOffset + bubbleHeight <= viewportHeight - viewportInset;
  const top = canPlaceBelow
    ? anchorRect.bottom + bubbleOffset
    : Math.max(viewportInset, anchorRect.top - bubbleHeight - bubbleOffset);

  return {
    left,
    top,
  };
}

export function SelectionTranslationBubble({
  anchorRect,
  translation,
}: SelectionTranslationBubbleProps) {
  return (
    <div
      aria-label="Selection translation"
      className="reader-selection-translation-bubble"
      role="status"
      style={buildBubbleStyle(anchorRect)}
    >
      <p className="reader-selection-translation-value">{translation}</p>
    </div>
  );
}
