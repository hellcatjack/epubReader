import { useEffect, useState } from "react";
import type { ReaderController } from "./readerController";
import { selectionBridge } from "./selectionBridge";

type EpubViewportProps = {
  bookId?: string;
  controller?: ReaderController;
  initialCfi?: string;
};

export function EpubViewport({ bookId, controller, initialCfi }: EpubViewportProps) {
  const [statusMessage, setStatusMessage] = useState("Open a book from the shelf to start reading.");
  const [selectionPreview, setSelectionPreview] = useState("");

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
      setStatusMessage("Open a book from the shelf to start reading.");
      return;
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
      <div className="epub-root" data-reader-mode={controller?.mode ?? "paginated"}>
        <p className="reader-eyebrow">Current chapter</p>
        <h1 className="reader-title">Demo Reader</h1>
        <p className="reader-copy">
          This container is reserved for the paginated EPUB surface and keeps the reader
          state wired through a single viewport component.
        </p>
      </div>
      <p className="reader-status">{statusMessage}</p>
      {selectionPreview ? <p className="reader-selection-preview">Selection: {selectionPreview}</p> : null}
    </section>
  );
}
