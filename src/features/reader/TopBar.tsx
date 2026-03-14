type TopBarProps = {
  canToggleBookmark?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  progress?: number;
};

export function TopBar({
  canToggleBookmark = false,
  isBookmarked = false,
  onToggleBookmark,
  progress = 0,
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
      <button
        aria-label={bookmarkLabel}
        className="reader-bookmark-button"
        disabled={!canToggleBookmark}
        onClick={onToggleBookmark}
        type="button"
      >
        {isBookmarked ? "Remove bookmark" : "Bookmark"}
      </button>
    </header>
  );
}
