import { useEffect, useRef, useState } from "react";
import type { AnnotationRecord } from "../../lib/types/annotations";
import { saveProgress } from "../bookshelf/progressRepository";
import type { TocItem } from "../../lib/types/books";
import { annotationRenderer } from "./annotationRenderer";
import { epubViewportRuntime, type EpubViewportRuntime } from "./epubRuntime";
import type { ReaderController } from "./readerController";
import { selectionBridge } from "./selectionBridge";

type EpubViewportProps = {
  bookId?: string;
  controller?: ReaderController;
  initialCfi?: string;
  onLocationChange?: (location: { cfi: string; progress: number; spineItemId: string }) => void;
  onTocChange?: (toc: TocItem[]) => void;
  visibleAnnotations?: AnnotationRecord[];
  runtime?: EpubViewportRuntime;
};

export function EpubViewport({
  bookId,
  controller,
  initialCfi,
  onLocationChange,
  onTocChange,
  runtime = epubViewportRuntime,
  visibleAnnotations = [],
}: EpubViewportProps) {
  const [statusMessage, setStatusMessage] = useState("Open a book from the shelf to start reading.");
  const [selectionPreview, setSelectionPreview] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    annotationRenderer.clear();
    annotationRenderer.paint(visibleAnnotations);

    return () => {
      annotationRenderer.clear();
    };
  }, [visibleAnnotations]);

  useEffect(() => {
    if (!controller) {
      return;
    }

    const unsubscribe = controller.observeSelection((selection) => {
      setSelectionPreview(selection?.text ?? "");
    });

    return unsubscribe;
  }, [controller]);

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
      let handle: { destroy(): void } | null = null;

      async function openPersistedBook(nextCfi?: string) {
        handle?.destroy();
        handle = await runtime.render({
          bookId: activeBookId,
          element: activeHost,
          initialCfi: nextCfi,
          onRelocated: ({ cfi, progress, spineItemId }) => {
            void saveProgress(activeBookId, { cfi, progress });
            onLocationChange?.({ cfi, progress, spineItemId });
          },
          onSelectionChange: ({ cfiRange, text }) => {
            setSelectionPreview(text);
            selectionBridge.publish(text ? { cfiRange, text } : null);
          },
          onTocChange,
        });
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
      selectionBridge.publish(null);
    };
  }, [bookId, controller, initialCfi]);

  return (
    <section className="epub-viewport" aria-label="Book content">
      <div className="epub-root" data-reader-mode={controller?.mode ?? "paginated"} ref={hostRef}>
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
      <p className="reader-status">{statusMessage}</p>
      <p className="reader-status">
        {visibleAnnotations.length} local annotation{visibleAnnotations.length === 1 ? "" : "s"} in view
      </p>
      {selectionPreview ? <p className="reader-selection-preview">Selection: {selectionPreview}</p> : null}
    </section>
  );
}
