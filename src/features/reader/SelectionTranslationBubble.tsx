import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ReaderSelectionRect } from "./selectionBridge";

type SelectionTranslationBubbleProps = {
  anchorRect: ReaderSelectionRect;
  onDismiss?: () => void;
  translation: string;
};

const bubbleTargetWidth = 600;
const estimatedBubbleHeight = 72;
const viewportInset = 16;
const bubbleOffset = 12;
const multiLineSelectionHeightThreshold = 96;

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.max(min, Math.min(value, max));
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return {
      height: 768,
      width: 1024,
    };
  }

  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

function resolveBubbleWidth(viewportWidth: number) {
  return Math.max(0, Math.min(bubbleTargetWidth, viewportWidth - viewportInset * 2));
}

function getSidePlacement(
  anchorRect: ReaderSelectionRect,
  viewportWidth: number,
  viewportHeight: number,
  bubbleHeight: number,
  bubbleWidth: number,
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

function buildBubbleStyle(
  anchorRect: ReaderSelectionRect,
  bubbleHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): CSSProperties {
  const bubbleWidth = resolveBubbleWidth(viewportWidth);
  const preferredLeft = anchorRect.left + anchorRect.width / 2 - bubbleWidth / 2;
  const centeredLeft = clamp(preferredLeft, viewportInset, viewportWidth - bubbleWidth - viewportInset);
  const sidePlacement = getSidePlacement(anchorRect, viewportWidth, viewportHeight, bubbleHeight, bubbleWidth);
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
    width: bubbleWidth,
  };
}

function useViewportSize() {
  const [viewportSize, setViewportSize] = useState(getViewportSize);

  useEffect(() => {
    const syncViewportSize = () => setViewportSize(getViewportSize());

    window.addEventListener("resize", syncViewportSize);
    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  return viewportSize;
}

export function SelectionTranslationBubble({
  anchorRect,
  onDismiss,
  translation,
}: SelectionTranslationBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const viewportSize = useViewportSize();
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) {
      return undefined;
    }

    const syncMeasuredHeight = () => {
      const nextHeight = bubble.getBoundingClientRect().height;
      if (nextHeight > 0) {
        setMeasuredHeight((current) => (Math.abs((current ?? 0) - nextHeight) > 0.5 ? nextHeight : current));
      }
    };

    syncMeasuredHeight();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(syncMeasuredHeight);
    resizeObserver.observe(bubble);
    return () => resizeObserver.disconnect();
  }, [translation, viewportSize.width]);

  const bubbleWidth = resolveBubbleWidth(viewportSize.width);
  const bubbleStyle = {
    ...buildBubbleStyle(anchorRect, measuredHeight ?? estimatedBubbleHeight, viewportSize.width, viewportSize.height),
    width: bubbleWidth,
  };

  return (
    <div
      aria-label="Selection translation"
      className="reader-selection-translation-bubble"
      onPointerDown={onDismiss}
      ref={bubbleRef}
      role="status"
      style={bubbleStyle}
    >
      <p className="reader-selection-translation-value">{translation}</p>
    </div>
  );
}
