import { Link } from "react-router-dom";
import type { BookshelfListItem } from "../../lib/types/books";

type BookCardProps = {
  book: BookshelfListItem;
  onOpen?: (bookId: string) => void;
  onDelete?: (bookId: string) => Promise<void> | void;
};

export function BookCard({ book, onDelete, onOpen }: BookCardProps) {
  return (
    <article className="book-card">
      <div className="book-card-body">
        <p className="book-card-kicker">Local EPUB</p>
        <h3 className="book-card-title">
          <Link to={`/books/${book.id}`}>{book.title}</Link>
        </h3>
        <p className="book-card-author">{book.author}</p>
        <p className="book-card-progress">{book.progressLabel}</p>
      </div>
      <div className="book-card-actions">
        <button className="book-card-primary" aria-label={`Open book ${book.title}`} onClick={() => onOpen?.(book.id)} type="button">
          Open book
        </button>
        <button className="book-card-secondary" aria-label={`Delete book ${book.title}`} onClick={() => onDelete?.(book.id)} type="button">
          Delete book
        </button>
      </div>
    </article>
  );
}
