import { useEffect, useMemo, useState } from "react";
import type { TocItem } from "../../lib/types/books";
import { collectExpandableTocIds, filterTocItems, findTocPathBySectionPath, findTocPathBySpineItemId, getTocTarget } from "./tocTree";

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
  currentSectionPath?: string[];
  currentSpineItemId?: string;
  highlights?: HighlightListItem[];
  notes?: NoteListItem[];
  onNavigateToBookmark?: (target: string) => void;
  onRemoveHighlight?: (id: string) => void;
  onNavigateToTocItem?: (target: string) => void;
  toc?: TocItem[];
};

export function LeftRail({
  bookmarks = [],
  currentSectionPath = [],
  currentSpineItemId = "",
  highlights = [],
  notes = [],
  onNavigateToBookmark,
  onRemoveHighlight,
  onNavigateToTocItem,
  toc = [],
}: LeftRailProps) {
  const [tocQuery, setTocQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [collapsedAutoExpandedIds, setCollapsedAutoExpandedIds] = useState<string[]>([]);
  const filteredToc = useMemo(() => filterTocItems(toc, tocQuery), [toc, tocQuery]);
  const normalizedCurrentSectionPath = useMemo(
    () => currentSectionPath.map((label) => label.trim()).filter(Boolean),
    [currentSectionPath.join("\u0000")],
  );
  const activeTocPath = useMemo(() => {
    if (tocQuery.trim()) {
      return [];
    }

    if (normalizedCurrentSectionPath.length) {
      const sectionPathMatch = findTocPathBySectionPath(toc, normalizedCurrentSectionPath);
      if (sectionPathMatch.length) {
        return sectionPathMatch;
      }

      return [];
    }

    return findTocPathBySpineItemId(toc, currentSpineItemId);
  }, [currentSpineItemId, normalizedCurrentSectionPath, toc, tocQuery]);
  const autoExpandedIds = useMemo(() => {
    if (tocQuery.trim()) {
      return collectExpandableTocIds(filteredToc);
    }

    return activeTocPath.filter((item) => item.children?.length).map((item) => item.id);
  }, [activeTocPath, filteredToc, tocQuery]);
  const effectiveAutoExpandedIds = useMemo(
    () =>
      tocQuery.trim()
        ? autoExpandedIds
        : autoExpandedIds.filter((id) => !collapsedAutoExpandedIds.includes(id)),
    [autoExpandedIds, collapsedAutoExpandedIds, tocQuery],
  );
  const mergedExpandedIds = useMemo(
    () => Array.from(new Set([...expandedIds, ...effectiveAutoExpandedIds])),
    [effectiveAutoExpandedIds, expandedIds],
  );
  const activeBranchId = [...activeTocPath].reverse().find((item) => item.children?.length)?.id ?? "";

  useEffect(() => {
    setCollapsedAutoExpandedIds((current) => current.filter((id) => autoExpandedIds.includes(id)));
  }, [autoExpandedIds]);

  function toggleExpanded(id: string) {
    if (!tocQuery.trim() && autoExpandedIds.includes(id) && !expandedIds.includes(id)) {
      setCollapsedAutoExpandedIds((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
      return;
    }

    setCollapsedAutoExpandedIds((current) => current.filter((item) => item !== id));
    setExpandedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function renderTocItems(items: TocItem[], depth = 0) {
    if (!items.length) {
      return null;
    }

    return (
      <ol className={depth === 0 ? "reader-list reader-toc-tree" : "reader-toc-children"}>
        {items.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const isExpanded = mergedExpandedIds.includes(item.id);
          const isActiveBranch = !tocQuery.trim() && activeBranchId === item.id;

          return (
            <li key={item.id} className={`reader-toc-item${isActiveBranch ? " reader-toc-item-active" : ""}`}>
              <div className="reader-toc-row">
                {hasChildren ? (
                  <button
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                    className="reader-toc-toggle"
                    onClick={() => toggleExpanded(item.id)}
                    type="button"
                  >
                    {isExpanded ? "−" : "+"}
                  </button>
                ) : (
                  <span className="reader-toc-toggle-spacer" aria-hidden="true" />
                )}
                <button
                  className="reader-toc-link"
                  onClick={() => onNavigateToTocItem?.(getTocTarget(item))}
                  type="button"
                >
                  {item.label}
                </button>
              </div>
              {hasChildren && isExpanded ? renderTocItems(item.children ?? [], depth + 1) : null}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <aside className="reader-rail">
      <nav aria-label="Table of contents" className="reader-panel reader-panel-muted reader-toc-panel">
        <h2>Table of contents</h2>
        {toc.length > 0 ? (
          <>
            <label className="reader-toc-search">
              <span>Search contents</span>
              <input
                aria-label="Search contents"
                onChange={(event) => setTocQuery(event.target.value)}
                placeholder="Find book or chapter"
                type="search"
                value={tocQuery}
              />
            </label>
            <div className="reader-toc-scroll">{renderTocItems(filteredToc) ?? <p>No matching sections.</p>}</div>
          </>
        ) : (
          <ol className="reader-list">
            <li>Open a book to load the table of contents.</li>
          </ol>
        )}
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
