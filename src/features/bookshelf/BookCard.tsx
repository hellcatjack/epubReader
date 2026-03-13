import { Link } from "react-router-dom";
import type { BookshelfListItem } from "../../lib/types/books";

type BookCardProps = {
  book: BookshelfListItem;
  onDelete?: (bookId: string) => Promise<void> | void;
};

export function BookCard({ book, onDelete }: BookCardProps) {
  return (
    <article>
      <Link to={`/books/${book.id}`}>{book.title}</Link>
      <p>{book.author}</p>
      <p>{book.progressLabel}</p>
      <button aria-label={`Delete book ${book.title}`} onClick={() => onDelete?.(book.id)} type="button">
        Delete book
      </button>
    </article>
  );
}
