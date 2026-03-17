import type { ProgressRecord } from "../../lib/types/books";
import { db } from "../../lib/db/appDb";

type SaveProgressInput = Omit<ProgressRecord, "bookId" | "updatedAt"> & {
  updatedAt?: number;
};

export async function saveProgress(bookId: string, progress: SaveProgressInput) {
  await db.progress.put({
    bookId,
    ...progress,
    updatedAt: progress.updatedAt ?? Date.now(),
  });
}

export async function getProgress(bookId: string) {
  return db.progress.get(bookId) ?? null;
}
