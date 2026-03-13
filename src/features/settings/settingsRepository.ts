import { db } from "../../lib/db/appDb";
import type { SettingsInput } from "../../lib/types/settings";

export async function saveSettings(settings: SettingsInput) {
  await db.settings.put({
    id: "settings",
    ...settings,
  });
}

export async function getSettings() {
  return db.settings.get("settings") ?? null;
}
