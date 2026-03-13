import { Link } from "react-router-dom";
import type { BookshelfListItem } from "../../lib/types/books";

type BookCardProps = {
  book: BookshelfListItem;
  onOpen?: (bookId: string) => void;
  onDelete?: (bookId: string) => Promise<void> | void;
};

export function BookCard({ book, onDelete, onOpen }: BookCardProps) {
  return (
    <article>
      <Link to={`/books/${book.id}`}>{book.title}</Link>
      <p>{book.author}</p>
      <p>{book.progressLabel}</p>
      <button aria-label={`Open book ${book.title}`} onClick={() => onOpen?.(book.id)} type="button">
        Open book
      </button>
      <button aria-label={`Delete book ${book.title}`} onClick={() => onDelete?.(book.id)} type="button">
        Delete book
      </button>
    </article>
  );
}
