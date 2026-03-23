import type { BookshelfListItem } from "../../lib/types/books";
import { BookCard } from "./BookCard";

type LibraryPanelProps = {
  books: BookshelfListItem[];
  mode?: "drawer" | "page";
  onDeleteBook: (bookId: string) => Promise<void> | void;
  onOpenBook: (bookId: string) => void;
};

function getContinueReadingBook(books: BookshelfListItem[]) {
  return books
    .filter((book) => typeof book.lastReadAt === "number")
    .sort((left, right) => (right.lastReadAt ?? 0) - (left.lastReadAt ?? 0))[0];
}

export function LibraryPanel({
  books,
  mode = "page",
  onDeleteBook,
  onOpenBook,
}: LibraryPanelProps) {
  const continueReadingBook = getContinueReadingBook(books);

  return (
    <section aria-label="Library content" className={`bookshelf-panel bookshelf-panel-${mode}`}>
      {continueReadingBook ? (
        <section aria-label="Continue reading" className="continue-reading-card">
          <div className="continue-reading-copy">
            <p className="bookshelf-eyebrow">Resume</p>
            <h2>Continue reading</h2>
            <h3>{continueReadingBook.title}</h3>
            <p>{continueReadingBook.author}</p>
            <p>{continueReadingBook.progressLabel}</p>
          </div>
          <button className="bookshelf-primary-action" type="button" onClick={() => onOpenBook(continueReadingBook.id)}>
            Continue {continueReadingBook.title}
          </button>
        </section>
      ) : null}

      <section aria-label="Local books" className="bookshelf-section">
        <div className="bookshelf-section-heading">
          <p className="bookshelf-eyebrow">Library</p>
          <h2>Local books</h2>
        </div>

        {books.length > 0 ? (
          <div className="bookshelf-grid">
            {books.map((book) => (
              <BookCard key={book.id} book={book} onDelete={onDeleteBook} onOpen={onOpenBook} />
            ))}
          </div>
        ) : (
          <p className="bookshelf-empty-state">No local books yet.</p>
        )}
      </section>
    </section>
  );
}
