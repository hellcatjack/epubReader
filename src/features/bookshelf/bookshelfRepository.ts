import type { BookRecord } from "../../lib/types/books";
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
