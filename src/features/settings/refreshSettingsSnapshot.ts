import type { SettingsInput } from "../../lib/types/settings";
import { defaultSettings } from "./settingsRepository";

const refreshSettingsSnapshotKey = "reader-refresh-settings";

type RefreshSettingsSnapshot = {
  settings: SettingsInput;
  updatedAt: number;
};

function canUseSessionStorage() {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

export function readRefreshSettingsSnapshot(): RefreshSettingsSnapshot | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(refreshSettingsSnapshotKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as RefreshSettingsSnapshot | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.updatedAt !== "number" ||
      !parsed.settings ||
      typeof parsed.settings.readingMode !== "string"
    ) {
      return null;
    }

    return {
      settings: {
        ...defaultSettings,
        ...parsed.settings,
      },
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function writeRefreshSettingsSnapshot(settings: SettingsInput, updatedAt = Date.now()) {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      refreshSettingsSnapshotKey,
      JSON.stringify({
        settings,
        updatedAt,
      } satisfies RefreshSettingsSnapshot),
    );
  } catch {
    // Ignore sessionStorage write failures and fall back to IndexedDB persistence.
  }
}

export function resolvePreferredSettingsSnapshot(
  refreshSnapshot: RefreshSettingsSnapshot | null,
  persistedSettings: SettingsInput,
) {
  return refreshSnapshot?.settings ?? persistedSettings;
}
