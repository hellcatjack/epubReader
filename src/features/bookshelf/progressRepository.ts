import type { ProgressRecord } from "../../lib/types/books";
import { db } from "../../lib/db/appDb";

export async function saveProgress(bookId: string, progress: Omit<ProgressRecord, "bookId">) {
  await db.progress.put({ bookId, ...progress });
}

export async function getProgress(bookId: string) {
  return db.progress.get(bookId) ?? null;
}
