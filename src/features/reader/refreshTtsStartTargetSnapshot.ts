const refreshTtsStartTargetKeyPrefix = "reader-refresh-tts-start-target:";

function getRefreshTtsStartTargetKey(bookId: string) {
  return `${refreshTtsStartTargetKeyPrefix}${bookId}`;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

export function readRefreshTtsStartTargetSnapshot(bookId: string) {
  if (!canUseSessionStorage()) {
    return "";
  }

  try {
    const rawValue = window.sessionStorage.getItem(getRefreshTtsStartTargetKey(bookId));
    if (!rawValue) {
      return "";
    }

    const parsed = JSON.parse(rawValue) as { bookId?: string; target?: string } | null;
    if (parsed?.bookId !== bookId || typeof parsed.target !== "string") {
      return "";
    }

    return parsed.target.trim();
  } catch {
    return "";
  }
}

export function writeRefreshTtsStartTargetSnapshot(bookId: string, target: string) {
  const normalizedTarget = target.trim();
  if (!canUseSessionStorage() || !normalizedTarget) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getRefreshTtsStartTargetKey(bookId),
      JSON.stringify({
        bookId,
        target: normalizedTarget,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore same-tab persistence failures and fall back to in-memory intent only.
  }
}

export function clearRefreshTtsStartTargetSnapshot(bookId: string) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(getRefreshTtsStartTargetKey(bookId));
  } catch {
    // Ignore same-tab persistence cleanup failures.
  }
}
