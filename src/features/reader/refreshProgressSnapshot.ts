import type { ProgressRecord } from "../../lib/types/books";

const refreshProgressSnapshotKeyPrefix = "reader-refresh-progress:";

export type RefreshProgressSnapshot = ProgressRecord & {
  sectionPath?: string[];
};

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

    const parsed = JSON.parse(rawValue) as RefreshProgressSnapshot | null;
    if (!parsed?.bookId || parsed.bookId !== bookId || !parsed.cfi) {
      return null;
    }

    const sectionPath = Array.isArray(parsed.sectionPath)
      ? parsed.sectionPath.map((label) => (typeof label === "string" ? label.trim() : "")).filter(Boolean)
      : undefined;

    return {
      ...parsed,
      ...(sectionPath?.length ? { sectionPath } : {}),
    };
  } catch {
    return null;
  }
}

export function writeRefreshProgressSnapshot(
  bookId: string,
  progress: Omit<RefreshProgressSnapshot, "bookId"> & { updatedAt?: number },
) {
  if (!canUseSessionStorage() || !progress.cfi) {
    return;
  }

  const sectionPath = Array.isArray(progress.sectionPath)
    ? progress.sectionPath.map((label) => (typeof label === "string" ? label.trim() : "")).filter(Boolean)
    : undefined;

  try {
    window.sessionStorage.setItem(
      getRefreshProgressSnapshotKey(bookId),
      JSON.stringify({
        bookId,
        ...progress,
        ...(sectionPath?.length ? { sectionPath } : {}),
        updatedAt: progress.updatedAt ?? Date.now(),
      } satisfies RefreshProgressSnapshot),
    );
  } catch {
    // Ignore sessionStorage quota or serialization failures and fall back to IndexedDB only.
  }
}

export function resolvePreferredProgress(
  refreshSnapshot: RefreshProgressSnapshot | null,
  persistedProgress: ProgressRecord | null,
): RefreshProgressSnapshot | ProgressRecord | null {
  return refreshSnapshot ?? persistedProgress;
}
