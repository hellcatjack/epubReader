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
  sectionPath?: string[];
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
  sectionPath = [],
  selectionActions,
  systemActions,
}: TopBarProps) {
  const progressPercent = Math.round(progress * 100);
  const bookmarkLabel = isBookmarked ? "Remove bookmark from this location" : "Bookmark this location";
  const normalizedSectionPath = sectionPath.map((label) => label.trim()).filter(Boolean);
  const currentSectionLabel = normalizedSectionPath.at(-1) ?? "Locating current section…";
  const sectionPrefix = normalizedSectionPath.slice(0, -1).join(" / ");

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
      <div className="reader-topbar-status">
        <div className="reader-topbar-metric reader-topbar-metric-progress">
          <span className="reader-topbar-label">Reading progress</span>
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
          <span className="reader-progress-value">{progressPercent}%</span>
        </div>
        <div className="reader-topbar-metric reader-topbar-metric-section">
          <span className="reader-topbar-label">Current section</span>
          <div aria-label="Current section" className="reader-current-section">
            {sectionPrefix ? <span className="reader-current-section-prefix">{sectionPrefix} / </span> : null}
            <span className="reader-current-section-current">{currentSectionLabel}</span>
          </div>
        </div>
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
