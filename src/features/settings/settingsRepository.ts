import { db } from "../../lib/db/appDb";
import type { SettingsInput, SettingsPatch, ThemeName } from "../../lib/types/settings";
import { DEFAULT_LLM_API_URL } from "../ai/aiEndpoints";

export function getDefaultContentBackgroundColor(theme: ThemeName) {
  if (theme === "light") {
    return "#fffdf8";
  }

  if (theme === "dark") {
    return "#1f1b18";
  }

  return "#f6edde";
}

export function createDefaultSettings(_hostname?: string): SettingsInput {
  const theme = "sepia";

  return {
    apiKey: "",
    geminiModel: "gemini-2.5-flash",
    llmApiUrl: DEFAULT_LLM_API_URL,
    localLlmModel: "",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme,
    ttsRate: 1,
    ttsFollowPlayback: false,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    readingMode: "scrolled",
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: getDefaultContentBackgroundColor(theme),
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    translationProvider: "local_llm",
  };
}

export const defaultSettings: SettingsInput = createDefaultSettings();
let settingsWriteQueue = Promise.resolve();

function isLegacySettingsRecord(record: Partial<SettingsInput> | undefined | null) {
  if (!record) {
    return false;
  }

  return (
    typeof record.llmApiUrl !== "string" ||
    typeof record.localLlmModel !== "string" ||
    typeof record.geminiModel !== "string" ||
    typeof record.translationProvider !== "string" ||
    typeof record.readingMode !== "string" ||
    typeof record.lineHeight !== "number" ||
    typeof record.letterSpacing !== "number" ||
    typeof record.paragraphSpacing !== "number" ||
    typeof record.paragraphIndent !== "number" ||
    typeof record.contentPadding !== "number" ||
    typeof record.contentBackgroundColor !== "string" ||
    typeof record.maxLineWidth !== "number" ||
    typeof record.columnCount !== "number" ||
    typeof record.fontFamily !== "string" ||
    typeof record.ttsFollowPlayback !== "boolean" ||
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
    contentBackgroundColor:
      typeof record.contentBackgroundColor === "string" && record.contentBackgroundColor.trim()
        ? record.contentBackgroundColor
        : getDefaultContentBackgroundColor((record.theme as ThemeName | undefined) ?? defaultSettings.theme),
  };

  if (record.targetLanguageCustomized !== true && migratedSettings.targetLanguage === "en") {
    migratedSettings.targetLanguage = "zh-CN";
  }

  if (
    record.ttsVoice === "Ryan" ||
    record.ttsVoice === "disabled" ||
    record.ttsVoice === "system-default" ||
    record.ttsVoice?.startsWith("af_") ||
    record.ttsVoice?.startsWith("am_")
  ) {
    migratedSettings.ttsVoice = "";
  }

  if (migratedSettings.translationProvider !== "local_llm" && migratedSettings.translationProvider !== "gemini_byok") {
    migratedSettings.translationProvider = defaultSettings.translationProvider;
  }

  if (
    isLegacySettingsRecord(record) ||
    record.targetLanguageCustomized !== migratedSettings.targetLanguageCustomized ||
    migratedSettings.targetLanguage !== record.targetLanguage
  ) {
    await db.settings.put({
      id: "settings",
      ...migratedSettings,
    });
  }

  return migratedSettings;
}

export async function saveSettings(settings: SettingsPatch) {
  settingsWriteQueue = settingsWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const existingSettings = await db.settings.get("settings");

      await db.settings.put({
        id: "settings",
        ...defaultSettings,
        ...existingSettings,
        ...settings,
      });
    });

  await settingsWriteQueue;
}

export async function getSettings() {
  const settings = await db.settings.get("settings");
  return migrateSettings((settings ?? null) as Partial<SettingsInput> | null);
}

export async function getResolvedSettings() {
  return (await getSettings()) ?? {
    id: "settings" as const,
    ...defaultSettings,
  };
}
