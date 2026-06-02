import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ReaderSelectionRect } from "./selectionBridge";

type SelectionTranslationBubbleProps = {
  anchorRect: ReaderSelectionRect;
  onDismiss?: () => void;
  translation: string;
};

const preferredBubbleWidth = 600;
const fallbackBubbleHeight = 72;
const viewportInset = 16;
const bubbleOffset = 12;
const multiLineSelectionHeightThreshold = 96;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getSidePlacement(
  anchorRect: ReaderSelectionRect,
  bubbleWidth: number,
  bubbleHeight: number,
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

function getBubbleWidth(viewportWidth: number) {
  return Math.max(0, Math.min(preferredBubbleWidth, viewportWidth - viewportInset * 2));
}

export function buildSelectionTranslationBubbleStyle(
  anchorRect: ReaderSelectionRect,
  bubbleHeight = fallbackBubbleHeight,
): CSSProperties {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const bubbleWidth = getBubbleWidth(viewportWidth);
  const preferredLeft = anchorRect.left + anchorRect.width / 2 - bubbleWidth / 2;
  const centeredLeft = clamp(preferredLeft, viewportInset, viewportWidth - bubbleWidth - viewportInset);
  const sidePlacement = getSidePlacement(anchorRect, bubbleWidth, bubbleHeight, viewportWidth, viewportHeight);
  const shouldPreferSidePlacement = anchorRect.height >= multiLineSelectionHeightThreshold;

  if (shouldPreferSidePlacement && sidePlacement) {
    return { ...sidePlacement, width: bubbleWidth };
  }

  const canPlaceAbove = anchorRect.top - bubbleHeight - bubbleOffset >= viewportInset;
  if (canPlaceAbove) {
    return {
      left: centeredLeft,
      top: anchorRect.top - bubbleHeight - bubbleOffset,
      width: bubbleWidth,
    };
  }

  const canPlaceBelow = anchorRect.bottom + bubbleOffset + bubbleHeight <= viewportHeight - viewportInset;
  if (canPlaceBelow) {
    return {
      left: centeredLeft,
      top: anchorRect.bottom + bubbleOffset,
      width: bubbleWidth,
    };
  }

  if (sidePlacement) {
    return { ...sidePlacement, width: bubbleWidth };
  }

  return {
    left: centeredLeft,
    top: clamp(anchorRect.bottom + bubbleOffset, viewportInset, viewportHeight - bubbleHeight - viewportInset),
    width: bubbleWidth,
  };
}

export function SelectionTranslationBubble({
  anchorRect,
  onDismiss,
  translation,
}: SelectionTranslationBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(fallbackBubbleHeight);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) {
      return undefined;
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(bubble.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setBubbleHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
      }
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(bubble);
    return () => resizeObserver.disconnect();
  }, [translation]);

  return (
    <div
      aria-label="Selection translation"
      className="reader-selection-translation-bubble"
      onPointerDown={onDismiss}
      ref={bubbleRef}
      role="status"
      style={buildSelectionTranslationBubbleStyle(anchorRect, bubbleHeight)}
    >
      <p className="reader-selection-translation-value">{translation}</p>
    </div>
  );
}
