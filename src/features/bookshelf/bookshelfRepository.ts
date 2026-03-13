import type { BookRecord, BookshelfListItem } from "../../lib/types/books";
import { db } from "../../lib/db/appDb";

function normalizeBlob(value: unknown) {
  if (value == null) {
    return null;
  }

  if (value instanceof Blob) {
    return value;
  }

  return new Blob([value as BlobPart]);
}

export async function saveBook(book: BookRecord) {
  await db.books.put(book);
}

export async function getBookByHash(importHash: string) {
  return (await db.books.where("importHash").equals(importHash).first()) ?? null;
}

export async function getBook(bookId: string) {
  const book = await db.books.get(bookId);
  if (!book) {
    return null;
  }

  return {
    ...book,
    coverThumbnailBlob: normalizeBlob(book.coverThumbnailBlob),
  };
}

export async function saveBookFile(bookId: string, file: Blob) {
  await db.bookFiles.put({ bookId, file });
}

export async function getBookFile(bookId: string) {
  const record = await db.bookFiles.get(bookId);
  return normalizeBlob(record?.file);
}

function formatProgressLabel(progress: number | undefined) {
  if (progress == null || progress <= 0) {
    return "Unread";
  }

  return `${Math.round(progress * 100)}% read`;
}

export async function listBookshelfItems(): Promise<BookshelfListItem[]> {
  const [books, progressRecords] = await Promise.all([db.books.toArray(), db.progress.toArray()]);
  const progressByBookId = new Map(progressRecords.map((record) => [record.bookId, record.progress]));

  return books
    .slice()
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      progressLabel: formatProgressLabel(progressByBookId.get(book.id)),
    }));
}
