import { Link } from "react-router-dom";
import type { BookshelfListItem } from "../../lib/types/books";

type BookCardProps = {
  book: BookshelfListItem;
};

export function BookCard({ book }: BookCardProps) {
  return (
    <article>
      <Link to={`/books/${book.id}`}>{book.title}</Link>
      <p>{book.author}</p>
      <p>{book.progressLabel}</p>
    </article>
  );
}
