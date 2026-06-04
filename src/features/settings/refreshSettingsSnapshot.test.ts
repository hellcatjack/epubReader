import { afterEach, expect, it } from "vitest";
import { defaultSettings } from "./settingsRepository";
import { readRefreshSettingsSnapshot } from "./refreshSettingsSnapshot";

afterEach(() => {
  window.sessionStorage.clear();
});

it("normalizes the old sepia default paper color when reading refresh settings snapshots", () => {
  window.sessionStorage.setItem(
    "reader-refresh-settings",
    JSON.stringify({
      settings: {
        ...defaultSettings,
        contentBackgroundColor: "#f6edde",
        theme: "sepia",
      },
      updatedAt: Date.now(),
    }),
  );

  expect(readRefreshSettingsSnapshot()?.settings.contentBackgroundColor).toBe("#f8f1e6");
});
