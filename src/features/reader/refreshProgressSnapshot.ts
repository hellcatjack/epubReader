import type { ProgressRecord } from "../../lib/types/books";

const refreshProgressSnapshotKeyPrefix = "reader-refresh-progress:";

function getRefreshProgressSnapshotKey(bookId: string) {
  return `${refreshProgressSnapshotKeyPrefix}${bookId}`;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

export function readRefreshProgressSnapshot(bookId: string) {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(getRefreshProgressSnapshotKey(bookId));
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as ProgressRecord | null;
    if (!parsed?.bookId || parsed.bookId !== bookId || !parsed.cfi) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeRefreshProgressSnapshot(
  bookId: string,
  progress: Omit<ProgressRecord, "bookId"> & { updatedAt?: number },
) {
  if (!canUseSessionStorage() || !progress.cfi) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getRefreshProgressSnapshotKey(bookId),
      JSON.stringify({
        bookId,
        ...progress,
        updatedAt: progress.updatedAt ?? Date.now(),
      } satisfies ProgressRecord),
    );
  } catch {
    // Ignore sessionStorage quota or serialization failures and fall back to IndexedDB only.
  }
}

export function resolvePreferredProgress(
  refreshSnapshot: ProgressRecord | null,
  persistedProgress: ProgressRecord | null,
): ProgressRecord | null {
  if (!refreshSnapshot) {
    return persistedProgress;
  }

  if (!persistedProgress) {
    return refreshSnapshot;
  }

  return (refreshSnapshot.updatedAt ?? 0) >= (persistedProgress.updatedAt ?? 0) ? refreshSnapshot : persistedProgress;
}
