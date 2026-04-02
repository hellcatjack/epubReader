import { useEffect, useRef, useState } from "react";
import type { AnnotationRecord } from "../../lib/types/annotations";
import type { ProgressRecord } from "../../lib/types/books";
import type { ReadingMode } from "../../lib/types/settings";
import { saveProgress } from "../bookshelf/progressRepository";
import type { TocItem } from "../../lib/types/books";
import { annotationRenderer } from "./annotationRenderer";
import {
  epubViewportRuntime,
  type ActiveTtsSegment,
  type EpubViewportRuntime,
  type RuntimeRenderHandle,
} from "./epubRuntime";
import type { ReaderPreferences } from "./readerPreferences";
import { selectionBridge } from "./selectionBridge";

type EpubViewportProps = {
  bookId?: string;
  activeTtsSegment?: ActiveTtsSegment | null;
  initialCfi?: string;
  initialProgress?: ProgressRecord | null;
  preferExactInitialTarget?: boolean;
  onLocationChange?: (location: {
    cfi: string;
    pageIndex?: number;
    pageOffset?: number;
    progress: number;
    sectionPath?: string[];
    scrollTop?: number;
    spineItemId: string;
    textQuote: string;
  }) => void;
  onReady?: (handle: RuntimeRenderHandle | null) => void;
  onStatusChange?: (status: string) => void;
  onTocChange?: (toc: TocItem[]) => void;
  readerPreferences?: ReaderPreferences;
  readingMode?: ReadingMode;
  ttsFollowPlayback?: boolean;
  visibleAnnotations?: AnnotationRecord[];
  runtime?: EpubViewportRuntime;
};

export function EpubViewport({
  activeTtsSegment = null,
  bookId,
  initialCfi,
  initialProgress = null,
  preferExactInitialTarget = false,
  onLocationChange,
  onReady,
  onStatusChange,
  onTocChange,
  readerPreferences,
  readingMode = "scrolled",
  ttsFollowPlayback = false,
  runtime = epubViewportRuntime,
  visibleAnnotations = [],
}: EpubViewportProps) {
  const [statusMessage, setStatusMessage] = useState("Open a book from the shelf to start reading.");
  const [pageKind, setPageKind] = useState<"image" | "prose">("prose");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeHandleRef = useRef<RuntimeRenderHandle | null>(null);
  const activeTtsSegmentRef = useRef<ActiveTtsSegment | null>(activeTtsSegment);

  useEffect(() => {
    annotationRenderer.clear();
    annotationRenderer.paint(visibleAnnotations);

    return () => {
      annotationRenderer.clear();
    };
  }, [visibleAnnotations]);

  useEffect(() => {
    onStatusChange?.(statusMessage);
  }, [onStatusChange, statusMessage]);

  useEffect(() => {
    if (!bookId) {
      setStatusMessage("Open a book from the shelf to start reading.");
      return;
    }

    if (!hostRef.current) {
      return;
    }

    const activeBookId = bookId;
    const activeHost = hostRef.current;
    let cancelled = false;
    let handle: RuntimeRenderHandle | null = null;

    async function openPersistedBook(nextCfi?: string) {
      const shouldRestorePaginatedFromChapter =
        readingMode === "paginated" &&
        !preferExactInitialTarget &&
        Boolean(initialProgress?.spineItemId) &&
        (!nextCfi || nextCfi === initialProgress?.cfi);
      const openTarget =
        shouldRestorePaginatedFromChapter && initialProgress?.spineItemId
          ? initialProgress.spineItemId
          : nextCfi;
      handle?.destroy();
      handle = await runtime.render({
        bookId: activeBookId,
        element: activeHost,
        flow: readingMode,
        initialCfi: openTarget,
        initialPageIndex:
          initialProgress &&
          ((shouldRestorePaginatedFromChapter && openTarget === initialProgress.spineItemId) ||
            nextCfi === initialProgress.cfi)
            ? initialProgress.pageIndex
            : undefined,
        initialPageOffset:
          initialProgress &&
          ((shouldRestorePaginatedFromChapter && openTarget === initialProgress.spineItemId) ||
            nextCfi === initialProgress.cfi)
            ? initialProgress.pageOffset
            : undefined,
        initialScrollTop:
          initialProgress && nextCfi === initialProgress.cfi ? initialProgress.scrollTop : undefined,
        initialPreferences: readerPreferences,
        onRelocated: ({ cfi, pageIndex, pageOffset, progress, sectionPath, scrollTop, spineItemId, textQuote }) => {
          void saveProgress(activeBookId, { cfi, pageIndex, pageOffset, progress, scrollTop, spineItemId, textQuote });
        onLocationChange?.({ cfi, pageIndex, pageOffset, progress, sectionPath, scrollTop, spineItemId, textQuote });
      },
      onPagePresentationChange: setPageKind,
      onSelectionChange: ({ cfiRange, isReleased, selectionRect, sentenceContext, spineItemId, text }) => {
        selectionBridge.publish(text ? { cfiRange, isReleased, selectionRect, sentenceContext, spineItemId, text } : null);
      },
      onTocChange,
    });

      if (cancelled) {
        handle.destroy();
        handle = null;
        return;
      }

      runtimeHandleRef.current = handle;
      await handle.setTtsPlaybackFollow?.(ttsFollowPlayback);
      await handle.setActiveTtsSegment(activeTtsSegmentRef.current);
      onReady?.(handle);
    }

    async function run() {
      setStatusMessage("Opening book...");

      try {
        await openPersistedBook(initialCfi);

        if (!cancelled) {
          setStatusMessage(initialCfi ? "Opened from saved reading position." : "Opened from chapter start.");
        }
      } catch {
        if (cancelled || !initialCfi) {
          setStatusMessage("Unable to open the selected book.");
          return;
        }

        if (initialProgress?.spineItemId) {
          try {
            await openPersistedBook(initialProgress.spineItemId);
            const recoveredCfi = initialProgress.textQuote
              ? await handle?.findCfiFromTextQuote(initialProgress.textQuote)
              : null;

            if (recoveredCfi) {
              await handle?.goTo(recoveredCfi);
              if (!cancelled) {
                setStatusMessage("Recovered from saved reading position.");
              }
            } else if (!cancelled) {
              setStatusMessage("Recovered from saved chapter.");
            }
            return;
          } catch {
            // Fall through to the chapter-start fallback below.
          }
        }

        try {
          await openPersistedBook(undefined);

          if (!cancelled) {
            setStatusMessage("Opened from chapter start.");
          }
        } catch {
          if (!cancelled) {
            setStatusMessage("Unable to open the selected book.");
          }
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      handle?.destroy();
      runtimeHandleRef.current = null;
      setPageKind("prose");
      onReady?.(null);
      selectionBridge.publish(null);
    };
  }, [
    bookId,
    initialCfi,
    initialProgress?.cfi,
    initialProgress?.pageIndex,
    initialProgress?.pageOffset,
    initialProgress?.progress,
    initialProgress?.scrollTop,
    initialProgress?.spineItemId,
    initialProgress?.textQuote,
    preferExactInitialTarget,
    readingMode,
  ]);

  useEffect(() => {
    activeTtsSegmentRef.current = activeTtsSegment;
  }, [activeTtsSegment]);

  useEffect(() => {
    if (runtimeHandleRef.current) {
      void runtimeHandleRef.current.setActiveTtsSegment(activeTtsSegment);
    }
  }, [activeTtsSegment]);

  useEffect(() => {
    if (runtimeHandleRef.current) {
      void runtimeHandleRef.current.setTtsPlaybackFollow?.(ttsFollowPlayback);
    }
  }, [ttsFollowPlayback]);

  return (
    <section className="epub-viewport" aria-label="Book content">
      <div
        className="epub-root"
        data-page-kind={pageKind}
        data-reader-mode={readingMode}
        data-tts-active={activeTtsSegment ? "true" : "false"}
        ref={hostRef}
      >
        {!bookId ? (
          <>
            <p className="reader-eyebrow">Current chapter</p>
            <h1 className="reader-title">Demo Reader</h1>
            <p className="reader-copy">
              This container is reserved for the paginated EPUB surface and keeps the
              reader state wired through a single viewport component.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
