import { db } from "../../lib/db/appDb";
import type { SettingsInput, SettingsPatch } from "../../lib/types/settings";

export const defaultSettings: SettingsInput = {
  apiKey: "",
  targetLanguage: "zh-CN",
  targetLanguageCustomized: false,
  theme: "sepia",
  ttsHelperUrl: "http://127.0.0.1:43115",
  ttsRate: 1,
  ttsVoice: "Ryan",
  ttsVolume: 1,
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

function isLegacySettingsRecord(record: Partial<SettingsInput> | undefined | null) {
  if (!record) {
    return false;
  }

  return (
    typeof record.readingMode !== "string" ||
    typeof record.lineHeight !== "number" ||
    typeof record.letterSpacing !== "number" ||
    typeof record.paragraphSpacing !== "number" ||
    typeof record.paragraphIndent !== "number" ||
    typeof record.contentPadding !== "number" ||
    typeof record.maxLineWidth !== "number" ||
    typeof record.columnCount !== "number" ||
    typeof record.fontFamily !== "string" ||
    typeof record.ttsHelperUrl !== "string" ||
    typeof record.ttsRate !== "number" ||
    typeof record.ttsVolume !== "number"
  );
}

async function migrateSettings(record: Partial<SettingsInput> | null) {
  if (!record) {
    return null;
  }

  const migratedSettings: SettingsInput = {
    ...defaultSettings,
    ...record,
  };

  if (record.targetLanguageCustomized !== true && migratedSettings.targetLanguage === "en") {
    migratedSettings.targetLanguage = "zh-CN";
  }

  if (record.ttsVoice === "disabled" || record.ttsVoice === "system-default") {
    migratedSettings.ttsVoice = "Ryan";
  }

  if (isLegacySettingsRecord(record) || record.targetLanguageCustomized !== migratedSettings.targetLanguageCustomized || migratedSettings.targetLanguage !== record.targetLanguage) {
    await db.settings.put({
      id: "settings",
      ...migratedSettings,
    });
  }

  return migratedSettings;
}

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
  const settings = await db.settings.get("settings");
  return migrateSettings(settings ?? null);
}

export async function getResolvedSettings() {
  return (await getSettings()) ?? {
    id: "settings" as const,
    ...defaultSettings,
  };
}
