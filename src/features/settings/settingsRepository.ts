import { db } from "../../lib/db/appDb";
import type { SettingsInput } from "../../lib/types/settings";

export const defaultSettings: SettingsInput = {
  apiKey: "",
  targetLanguage: "en",
  theme: "sepia",
  ttsVoice: "disabled",
  fontScale: 1,
};

export async function saveSettings(settings: SettingsInput) {
  await db.settings.put({
    id: "settings",
    ...defaultSettings,
    ...settings,
  });
}

export async function getSettings() {
  return db.settings.get("settings") ?? null;
}

export async function getResolvedSettings() {
  return (await getSettings()) ?? {
    id: "settings" as const,
    ...defaultSettings,
  };
}
