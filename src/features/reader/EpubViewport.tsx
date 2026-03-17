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
import type { ReaderController } from "./readerController";
import { selectionBridge } from "./selectionBridge";

type EpubViewportProps = {
  bookId?: string;
  controller?: ReaderController;
  activeTtsSegment?: ActiveTtsSegment | null;
  initialCfi?: string;
  initialProgress?: ProgressRecord | null;
  onLocationChange?: (location: { cfi: string; progress: number; spineItemId: string; textQuote: string }) => void;
  onReady?: (handle: RuntimeRenderHandle | null) => void;
  onStatusChange?: (status: string) => void;
  onTocChange?: (toc: TocItem[]) => void;
  readingMode?: ReadingMode;
  visibleAnnotations?: AnnotationRecord[];
  runtime?: EpubViewportRuntime;
};

export function EpubViewport({
  activeTtsSegment = null,
  bookId,
  controller,
  initialCfi,
  initialProgress = null,
  onLocationChange,
  onReady,
  onStatusChange,
  onTocChange,
  readingMode = "scrolled",
  runtime = epubViewportRuntime,
  visibleAnnotations = [],
}: EpubViewportProps) {
  const [statusMessage, setStatusMessage] = useState("Open a book from the shelf to start reading.");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeHandleRef = useRef<RuntimeRenderHandle | null>(null);

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
    if (!controller || !bookId) {
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
        handle?.destroy();
        handle = await runtime.render({
          bookId: activeBookId,
          element: activeHost,
          flow: readingMode,
          initialCfi: nextCfi,
          onRelocated: ({ cfi, progress, spineItemId, textQuote }) => {
            void saveProgress(activeBookId, { cfi, progress, spineItemId, textQuote });
            onLocationChange?.({ cfi, progress, spineItemId, textQuote });
          },
          onSelectionChange: ({ cfiRange, text }) => {
            selectionBridge.publish(text ? { cfiRange, text } : null);
          },
          onTocChange,
        });

        if (cancelled) {
          handle.destroy();
          handle = null;
          return;
        }

        runtimeHandleRef.current = handle;
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
        onReady?.(null);
        selectionBridge.publish(null);
      };
    }

    const activeController = controller;
    const activeBookId = bookId;
    let cancelled = false;

    async function openBook() {
      setStatusMessage("Opening book...");

      try {
        await activeController.open(activeBookId, initialCfi);

        if (!cancelled) {
          setStatusMessage(initialCfi ? "Opened from saved reading position." : "Opened from chapter start.");
        }
      } catch {
        if (cancelled || !initialCfi) {
          setStatusMessage("Unable to open the selected book.");
          return;
        }

        try {
          await activeController.open(activeBookId, undefined);

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

    openBook();

    return () => {
      cancelled = true;
      onReady?.(null);
      selectionBridge.publish(null);
    };
  }, [bookId, controller, initialCfi, initialProgress]);

  useEffect(() => {
    if (!controller && runtimeHandleRef.current) {
      void runtimeHandleRef.current.setFlow(readingMode);
    }
  }, [controller, readingMode]);

  useEffect(() => {
    if (!controller && runtimeHandleRef.current) {
      void runtimeHandleRef.current.setActiveTtsSegment(activeTtsSegment);
    }
  }, [activeTtsSegment, controller]);

  return (
    <section className="epub-viewport" aria-label="Book content">
      <div
        className="epub-root"
        data-reader-mode={controller?.mode ?? readingMode}
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
