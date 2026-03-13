import { getBookFile, saveBookFile } from "./bookshelfRepository";

export { saveBookFile };

export async function loadStoredBookFile(bookId: string) {
  const file = await getBookFile(bookId);

  if (!file) {
    throw new Error(`Stored EPUB file not found for book ${bookId}`);
  }

  return file;
}
