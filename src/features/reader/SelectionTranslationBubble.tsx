import type { CSSProperties } from "react";
import type { ReaderSelectionRect } from "./selectionBridge";

type SelectionTranslationBubbleProps = {
  anchorRect: ReaderSelectionRect;
  onDismiss?: () => void;
  translation: string;
};

const bubbleWidth = 320;
const bubbleHeight = 72;
const viewportInset = 16;
const bubbleOffset = 12;
const multiLineSelectionHeightThreshold = 96;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getSidePlacement(
  anchorRect: ReaderSelectionRect,
  viewportWidth: number,
  viewportHeight: number,
): CSSProperties | null {
  const sideTop = clamp(anchorRect.top, viewportInset, viewportHeight - bubbleHeight - viewportInset);
  const rightLeft = anchorRect.right + bubbleOffset;
  if (rightLeft + bubbleWidth <= viewportWidth - viewportInset) {
    return {
      left: rightLeft,
      top: sideTop,
    };
  }

  const leftSideLeft = anchorRect.left - bubbleWidth - bubbleOffset;
  if (leftSideLeft >= viewportInset) {
    return {
      left: leftSideLeft,
      top: sideTop,
    };
  }

  return null;
}

function buildBubbleStyle(anchorRect: ReaderSelectionRect): CSSProperties {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const preferredLeft = anchorRect.left + anchorRect.width / 2 - bubbleWidth / 2;
  const centeredLeft = clamp(preferredLeft, viewportInset, viewportWidth - bubbleWidth - viewportInset);
  const sidePlacement = getSidePlacement(anchorRect, viewportWidth, viewportHeight);
  const shouldPreferSidePlacement = anchorRect.height >= multiLineSelectionHeightThreshold;

  if (shouldPreferSidePlacement && sidePlacement) {
    return sidePlacement;
  }

  const canPlaceAbove = anchorRect.top - bubbleHeight - bubbleOffset >= viewportInset;
  if (canPlaceAbove) {
    return {
      left: centeredLeft,
      top: anchorRect.top - bubbleHeight - bubbleOffset,
    };
  }

  const canPlaceBelow = anchorRect.bottom + bubbleOffset + bubbleHeight <= viewportHeight - viewportInset;
  if (canPlaceBelow) {
    return {
      left: centeredLeft,
      top: anchorRect.bottom + bubbleOffset,
    };
  }

  if (sidePlacement) {
    return sidePlacement;
  }

  return {
    left: centeredLeft,
    top: clamp(anchorRect.bottom + bubbleOffset, viewportInset, viewportHeight - bubbleHeight - viewportInset),
  };
}

export function SelectionTranslationBubble({
  anchorRect,
  onDismiss,
  translation,
}: SelectionTranslationBubbleProps) {
  return (
    <div
      aria-label="Selection translation"
      className="reader-selection-translation-bubble"
      onPointerDown={onDismiss}
      role="status"
      style={buildBubbleStyle(anchorRect)}
    >
      <p className="reader-selection-translation-value">{translation}</p>
    </div>
  );
}
