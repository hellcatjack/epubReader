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

const scrolledRelocationFlushMs = 240;
const scrolledResizeRecoveryMs = 480;

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
    let pendingScrolledRelocation:
      | {
          cfi: string;
          pageIndex?: number;
          pageOffset?: number;
          progress: number;
          sectionPath?: string[];
          scrollTop?: number;
          spineItemId: string;
          textQuote: string;
        }
      | null = null;
    let pendingScrolledRelocationTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingScrolledResizeRecovery:
      | {
          cfi: string;
          scrollTop?: number;
          textQuote: string;
        }
      | null =
      readingMode === "scrolled" && initialProgress
        ? {
            cfi: initialProgress.cfi,
            scrollTop: initialProgress.scrollTop,
            textQuote: initialProgress.textQuote ?? "",
          }
        : null;
    let pendingScrolledResizeRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCommittedScrolledLocation:
      | {
          cfi: string;
          scrollTop?: number;
          textQuote: string;
        }
      | null =
      readingMode === "scrolled" && initialProgress
        ? {
            cfi: initialProgress.cfi,
            scrollTop: initialProgress.scrollTop,
            textQuote: initialProgress.textQuote ?? "",
          }
        : null;
    let lastRelocationCommitAt = 0;

    const clearPendingScrolledRelocationTimer = () => {
      if (pendingScrolledRelocationTimer) {
        clearTimeout(pendingScrolledRelocationTimer);
        pendingScrolledRelocationTimer = null;
      }
    };

    const clearPendingScrolledResizeRecovery = () => {
      if (pendingScrolledResizeRecoveryTimer) {
        clearTimeout(pendingScrolledResizeRecoveryTimer);
        pendingScrolledResizeRecoveryTimer = null;
      }
      pendingScrolledResizeRecovery = null;
    };

    const matchesPendingScrolledResizeRecovery = (location: {
      cfi: string;
      textQuote: string;
    }) => {
      if (!pendingScrolledResizeRecovery) {
        return false;
      }

      return (
        (pendingScrolledResizeRecovery.cfi && location.cfi === pendingScrolledResizeRecovery.cfi) ||
        (pendingScrolledResizeRecovery.textQuote && location.textQuote === pendingScrolledResizeRecovery.textQuote)
      );
    };

    const updateScrolledViewportState = (scrollTop?: number) => {
      if (readingMode !== "scrolled") {
        return;
      }

      const container = activeHost.querySelector<HTMLElement>(".epub-container");
      if (container) {
        container.dataset.lastKnownScrollTop = String(
          typeof scrollTop === "number" && Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : container.scrollTop,
        );
      }
    };

    const commitRelocation = (location: {
      cfi: string;
      pageIndex?: number;
      pageOffset?: number;
      progress: number;
      sectionPath?: string[];
      scrollTop?: number;
      spineItemId: string;
      textQuote: string;
    }) => {
      clearPendingScrolledRelocationTimer();
      pendingScrolledRelocation = null;
      lastRelocationCommitAt = Date.now();
      updateScrolledViewportState(location.scrollTop);
      if (readingMode === "scrolled") {
        lastCommittedScrolledLocation = {
          cfi: location.cfi,
          scrollTop: location.scrollTop,
          textQuote: location.textQuote,
        };
        if (matchesPendingScrolledResizeRecovery(location)) {
          clearPendingScrolledResizeRecovery();
        }
      }

      const { sectionPath, ...persistedLocation } = location;
      void saveProgress(activeBookId, persistedLocation);
      onLocationChange?.({
        ...persistedLocation,
        ...(sectionPath?.length ? { sectionPath } : {}),
      });
    };

    const flushPendingScrolledRelocation = () => {
      if (!pendingScrolledRelocation) {
        return;
      }

      commitRelocation(pendingScrolledRelocation);
    };

    const bridgeRelocated = (location: {
      cfi: string;
      pageIndex?: number;
      pageOffset?: number;
      progress: number;
      sectionPath?: string[];
      scrollTop?: number;
      spineItemId: string;
      textQuote: string;
    }) => {
      if (readingMode !== "scrolled") {
        commitRelocation(location);
        return;
      }

      pendingScrolledRelocation = location;
      const elapsed = Date.now() - lastRelocationCommitAt;
      if (lastRelocationCommitAt === 0 || elapsed >= scrolledRelocationFlushMs) {
        commitRelocation(location);
        return;
      }

      clearPendingScrolledRelocationTimer();
      pendingScrolledRelocationTimer = setTimeout(() => {
        flushPendingScrolledRelocation();
      }, scrolledRelocationFlushMs - elapsed);
    };

    const handlePageHide = () => {
      flushPendingScrolledRelocation();
    };

    window.addEventListener("pagehide", handlePageHide);

    const handleWindowResize = () => {
      if (readingMode !== "scrolled") {
        return;
      }

      const preservedLocation = pendingScrolledRelocation ?? lastCommittedScrolledLocation;
      if (!preservedLocation || (!preservedLocation.cfi && typeof preservedLocation.scrollTop !== "number")) {
        return;
      }

      pendingScrolledResizeRecovery = {
        cfi: preservedLocation.cfi,
        scrollTop: preservedLocation.scrollTop,
        textQuote: preservedLocation.textQuote,
      };
      if (pendingScrolledResizeRecoveryTimer) {
        clearTimeout(pendingScrolledResizeRecoveryTimer);
      }
      pendingScrolledResizeRecoveryTimer = setTimeout(() => {
        const recovery = pendingScrolledResizeRecovery;
        pendingScrolledResizeRecoveryTimer = null;
        if (!recovery) {
          return;
        }

        if (handle?.goTo && recovery.cfi) {
          void handle.goTo(recovery.cfi).catch(() => {
            const container = activeHost.querySelector<HTMLElement>(".epub-container");
            if (container && typeof recovery.scrollTop === "number" && Number.isFinite(recovery.scrollTop)) {
              container.scrollTop = Math.max(0, recovery.scrollTop);
              updateScrolledViewportState(container.scrollTop);
            }
          });
          return;
        }

        const container = activeHost.querySelector<HTMLElement>(".epub-container");
        if (container && typeof recovery.scrollTop === "number" && Number.isFinite(recovery.scrollTop)) {
          container.scrollTop = Math.max(0, recovery.scrollTop);
          updateScrolledViewportState(container.scrollTop);
        }
      }, scrolledResizeRecoveryMs);
    };

    window.addEventListener("resize", handleWindowResize);

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
        onRelocated: bridgeRelocated,
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
      updateScrolledViewportState(initialProgress?.scrollTop);
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
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("resize", handleWindowResize);
      flushPendingScrolledRelocation();
      clearPendingScrolledRelocationTimer();
      clearPendingScrolledResizeRecovery();
      pendingScrolledRelocation = null;
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
