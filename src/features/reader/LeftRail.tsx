export function LeftRail() {
  return (
    <aside className="reader-rail">
      <nav aria-label="Table of contents" className="reader-panel reader-panel-muted">
        <h2>Table of contents</h2>
        <ol className="reader-list">
          <li>Foreword</li>
          <li>Chapter 1</li>
          <li>Chapter 2</li>
        </ol>
      </nav>
      <section className="reader-panel reader-panel-muted" aria-label="Saved markers">
        <h2>Bookmarks</h2>
        <p>No bookmarks at this location yet.</p>
      </section>
      <section className="reader-panel reader-panel-muted" aria-label="Saved highlights">
        <h2>Highlights</h2>
        <p>Highlights pinned to the current chapter will appear here.</p>
      </section>
      <section className="reader-panel reader-panel-muted" aria-label="Saved notes">
        <h2>Notes</h2>
        <p>Local notes stay attached to the selected passage.</p>
      </section>
    </aside>
  );
}
