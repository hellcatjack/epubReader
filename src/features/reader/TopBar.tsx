export function TopBar() {
  return (
    <header className="reader-topbar">
      <div>
        <p className="reader-topbar-label">Reading progress</p>
        <div
          aria-label="Reading progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={18}
          className="reader-progress"
          role="progressbar"
        >
          <span className="reader-progress-fill" style={{ width: "18%" }} />
        </div>
        <p className="reader-topbar-label">Local annotations enabled</p>
      </div>
      <button className="reader-bookmark-button" type="button" aria-label="Bookmark this location">
        Bookmark
      </button>
    </header>
  );
}
