export type ThemeName = "light" | "sepia" | "dark";
export type ReadingMode = "scrolled" | "paginated";
export type ReaderFontFamily = "serif" | "sans" | "book";

export type SettingsRecord = {
  id: "settings";
  apiKey: string;
  targetLanguage: string;
  targetLanguageCustomized: boolean;
  theme: ThemeName;
  ttsVoice: string;
  fontScale: number;
  readingMode: ReadingMode;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  paragraphIndent: number;
  contentPadding: number;
  maxLineWidth: number;
  columnCount: 1 | 2;
  fontFamily: ReaderFontFamily;
};

export type SettingsInput = Omit<SettingsRecord, "id">;
export type SettingsPatch = Partial<SettingsInput>;
