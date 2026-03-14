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
}: TopBarProps) {
  const progressPercent = Math.round(progress * 100);
  const bookmarkLabel = isBookmarked ? "Remove bookmark from this location" : "Bookmark this location";

  return (
    <header className="reader-topbar">
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
      </div>
    </header>
  );
}
