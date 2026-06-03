import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ReaderSelectionRect } from "./selectionBridge";

type SelectionTranslationBubbleProps = {
  anchorRect: ReaderSelectionRect;
  onDismiss?: () => void;
  translation: string;
};

const maximumBubbleWidth = 600;
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

function getMaximumBubbleWidth(viewportWidth: number) {
  return Math.max(0, Math.min(maximumBubbleWidth, viewportWidth - viewportInset * 2));
}

function getPlacementBubbleWidth(viewportWidth: number, measuredBubbleWidth?: number) {
  const maxWidth = getMaximumBubbleWidth(viewportWidth);
  if (typeof measuredBubbleWidth !== "number" || measuredBubbleWidth <= 0) {
    return maxWidth;
  }

  return Math.min(measuredBubbleWidth, maxWidth);
}

export function buildSelectionTranslationBubbleStyle(
  anchorRect: ReaderSelectionRect,
  bubbleHeight = fallbackBubbleHeight,
  measuredBubbleWidth?: number,
): CSSProperties {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  const maxWidth = getMaximumBubbleWidth(viewportWidth);
  const bubbleWidth = getPlacementBubbleWidth(viewportWidth, measuredBubbleWidth);
  const preferredLeft = anchorRect.left + anchorRect.width / 2 - bubbleWidth / 2;
  const centeredLeft = clamp(preferredLeft, viewportInset, viewportWidth - bubbleWidth - viewportInset);
  const sidePlacement = getSidePlacement(anchorRect, bubbleWidth, bubbleHeight, viewportWidth, viewportHeight);
  const shouldPreferSidePlacement = anchorRect.height >= multiLineSelectionHeightThreshold;

  if (shouldPreferSidePlacement && sidePlacement) {
    return { ...sidePlacement, maxWidth };
  }

  const canPlaceAbove = anchorRect.top - bubbleHeight - bubbleOffset >= viewportInset;
  if (canPlaceAbove) {
    return {
      left: centeredLeft,
      maxWidth,
      top: anchorRect.top - bubbleHeight - bubbleOffset,
    };
  }

  const canPlaceBelow = anchorRect.bottom + bubbleOffset + bubbleHeight <= viewportHeight - viewportInset;
  if (canPlaceBelow) {
    return {
      left: centeredLeft,
      maxWidth,
      top: anchorRect.bottom + bubbleOffset,
    };
  }

  if (sidePlacement) {
    return { ...sidePlacement, maxWidth };
  }

  return {
    left: centeredLeft,
    maxWidth,
    top: clamp(anchorRect.bottom + bubbleOffset, viewportInset, viewportHeight - bubbleHeight - viewportInset),
  };
}

export function SelectionTranslationBubble({
  anchorRect,
  onDismiss,
  translation,
}: SelectionTranslationBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleSize, setBubbleSize] = useState({
    height: fallbackBubbleHeight,
    width: 0,
  });

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) {
      return undefined;
    }

    const updateHeight = () => {
      const rect = bubble.getBoundingClientRect();
      const nextHeight = Math.ceil(rect.height);
      const nextWidth = Math.ceil(rect.width);
      if (nextHeight > 0 || nextWidth > 0) {
        setBubbleSize((currentSize) => {
          const nextSize = {
            height: nextHeight > 0 ? nextHeight : currentSize.height,
            width: nextWidth > 0 ? nextWidth : currentSize.width,
          };
          return currentSize.height === nextSize.height && currentSize.width === nextSize.width ? currentSize : nextSize;
        });
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
      style={buildSelectionTranslationBubbleStyle(anchorRect, bubbleSize.height, bubbleSize.width)}
    >
      <p className="reader-selection-translation-value">{translation}</p>
    </div>
  );
}
