import type { KeyboardEvent, ReactNode } from "react";
import type { ReadingMode } from "../../lib/types/settings";

type TopBarProps = {
  canToggleBookmark?: boolean;
  canTurnPages?: boolean;
  isBookmarked?: boolean;
  onChangeReadingMode?: (mode: ReadingMode) => void;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  onToggleBookmark?: () => void;
  progress?: number;
  readingMode?: ReadingMode;
  selectionActions?: ReactNode;
  systemActions?: ReactNode;
};

export function TopBar({
  canToggleBookmark = false,
  canTurnPages = false,
  isBookmarked = false,
  onChangeReadingMode,
  onNextPage,
  onPrevPage,
  onToggleBookmark,
  progress = 0,
  readingMode = "scrolled",
  selectionActions,
  systemActions,
}: TopBarProps) {
  const progressPercent = Math.round(progress * 100);
  const bookmarkLabel = isBookmarked ? "Remove bookmark from this location" : "Bookmark this location";

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!canTurnPages || readingMode !== "paginated") {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onNextPage?.();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onPrevPage?.();
    }
  }

  return (
    <header className="reader-topbar" onKeyDown={handleKeyDown} role="banner" tabIndex={0}>
      <div>
        <p className="reader-topbar-label">Reading progress</p>
        <div
          aria-label="Reading progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          className="reader-progress"
          role="progressbar"
        >
          <span className="reader-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="reader-topbar-label">Local annotations enabled</p>
      </div>
      <div className="reader-topbar-actions">
        {systemActions ? <div className="reader-system-actions">{systemActions}</div> : null}
        <div className="reader-mode-toggle" role="group" aria-label="Reading mode">
          <button
            aria-pressed={readingMode === "scrolled"}
            className="reader-mode-button"
            onClick={() => onChangeReadingMode?.("scrolled")}
            type="button"
          >
            Scrolled mode
          </button>
          <button
            aria-pressed={readingMode === "paginated"}
            className="reader-mode-button"
            onClick={() => onChangeReadingMode?.("paginated")}
            type="button"
          >
            Paginated mode
          </button>
        </div>
        <div className="reader-page-controls" role="group" aria-label="Page controls">
          <button aria-label="Previous page" className="reader-page-button" disabled={!canTurnPages} onClick={onPrevPage} type="button">
            Prev
          </button>
          <button aria-label="Next page" className="reader-page-button" disabled={!canTurnPages} onClick={onNextPage} type="button">
            Next
          </button>
        </div>
        <button
          aria-label={bookmarkLabel}
          className="reader-bookmark-button"
          disabled={!canToggleBookmark}
          onClick={onToggleBookmark}
          type="button"
        >
          {isBookmarked ? "Remove bookmark" : "Bookmark"}
        </button>
        {selectionActions}
      </div>
    </header>
  );
}
