import type { BookshelfListItem } from "../../lib/types/books";
import { BookCard } from "./BookCard";

type BookshelfPageProps = {
  books?: BookshelfListItem[];
};

export function BookshelfPage({ books = [] }: BookshelfPageProps) {
  return (
    <main>
      <h1>Bookshelf</h1>
      <section aria-label="Local books">
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </section>
    </main>
  );
}
