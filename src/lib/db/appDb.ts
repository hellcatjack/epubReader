import Dexie, { type Table } from "dexie";
import type { AnnotationRecord } from "../types/annotations";
import type { BookRecord, ProgressRecord, StoredBookFileRecord } from "../types/books";
import type { SettingsRecord } from "../types/settings";
import { DB_NAME, DB_VERSION } from "./schema";

class AppDb extends Dexie {
  books!: Table<BookRecord, string>;
  bookFiles!: Table<StoredBookFileRecord, string>;
  progress!: Table<ProgressRecord, string>;
  annotations!: Table<AnnotationRecord, string>;
  settings!: Table<SettingsRecord, "settings">;

  constructor() {
    super(DB_NAME);

    this.version(DB_VERSION).stores({
      books: "id, importHash, title, author",
      bookFiles: "bookId",
      progress: "bookId",
      annotations: "id, bookId, spineItemId, kind, updatedAt",
      settings: "id",
    });
  }
}

export const db = new AppDb();

export async function resetDb() {
  await Promise.all([
    db.books.clear(),
    db.bookFiles.clear(),
    db.progress.clear(),
    db.annotations.clear(),
    db.settings.clear(),
  ]);
}
