import { db } from "../../lib/db/appDb";
import type { SettingsInput, SettingsPatch } from "../../lib/types/settings";

export const defaultSettings: SettingsInput = {
  apiKey: "",
  targetLanguage: "zh-CN",
  theme: "sepia",
  ttsVoice: "disabled",
  fontScale: 1,
  readingMode: "scrolled",
  lineHeight: 1.7,
  letterSpacing: 0,
  paragraphSpacing: 0.85,
  paragraphIndent: 1.8,
  contentPadding: 32,
  maxLineWidth: 760,
  columnCount: 1,
  fontFamily: "book",
};

export async function saveSettings(settings: SettingsPatch) {
  const existingSettings = await db.settings.get("settings");

  await db.settings.put({
    id: "settings",
    ...defaultSettings,
    ...existingSettings,
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
