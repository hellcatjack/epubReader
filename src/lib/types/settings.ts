export type ThemeName = "light" | "sepia" | "dark";

export type SettingsRecord = {
  id: "settings";
  apiKey: string;
  targetLanguage: string;
  theme: ThemeName;
  ttsVoice: string;
  fontScale: number;
};

export type SettingsInput = Omit<SettingsRecord, "id">;
