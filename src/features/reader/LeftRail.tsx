import type { TocItem } from "../../lib/types/books";

type BookmarkListItem = {
  cfi: string;
  id: string;
  label: string;
};

type HighlightListItem = {
  id: string;
  text: string;
};

type NoteListItem = {
  id: string;
  text: string;
};

type LeftRailProps = {
  bookmarks?: BookmarkListItem[];
  highlights?: HighlightListItem[];
  notes?: NoteListItem[];
  onNavigateToBookmark?: (target: string) => void;
  onRemoveHighlight?: (id: string) => void;
  onNavigateToTocItem?: (target: string) => void;
  toc?: TocItem[];
};

export function LeftRail({
  bookmarks = [],
  highlights = [],
  notes = [],
  onNavigateToBookmark,
  onRemoveHighlight,
  onNavigateToTocItem,
  toc = [],
}: LeftRailProps) {
  return (
    <aside className="reader-rail">
      <nav aria-label="Table of contents" className="reader-panel reader-panel-muted">
        <h2>Table of contents</h2>
        <ol className="reader-list">
          {toc.length > 0 ? (
            toc.map((item) => (
              <li key={item.id}>
                <button
                  className="reader-toc-link"
                  onClick={() => onNavigateToTocItem?.(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              </li>
            ))
          ) : (
            <li>Open a book to load the table of contents.</li>
          )}
        </ol>
      </nav>
      <section className="reader-panel reader-panel-muted" aria-label="Saved markers">
        <h2>Bookmarks</h2>
        {bookmarks.length > 0 ? (
          <ol className="reader-list">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id}>
                <button
                  className="reader-toc-link"
                  onClick={() => onNavigateToBookmark?.(bookmark.cfi)}
                  type="button"
                >
                  {bookmark.label}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>No bookmarks saved yet.</p>
        )}
      </section>
      <section className="reader-panel reader-panel-muted" aria-label="Saved highlights">
        <h2>Highlights</h2>
        {highlights.length > 0 ? (
          <ol className="reader-list">
            {highlights.map((highlight) => (
              <li key={highlight.id}>
                <div className="reader-saved-item">
                  <span>{highlight.text}</span>
                  <button
                    aria-label={`Remove highlight ${highlight.text}`}
                    className="reader-inline-action"
                    onClick={() => onRemoveHighlight?.(highlight.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>Highlights pinned to the current chapter will appear here.</p>
        )}
      </section>
      <section className="reader-panel reader-panel-muted" aria-label="Saved notes">
        <h2>Notes</h2>
        {notes.length > 0 ? (
          <ol className="reader-list">
            {notes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ol>
        ) : (
          <p>Local notes stay attached to the selected passage.</p>
        )}
      </section>
    </aside>
  );
}
