export type ThemeName = "light" | "sepia" | "dark";
export type ReadingMode = "scrolled" | "paginated";
export type ReaderFontFamily = "serif" | "sans" | "book";
export type TranslationProvider = "local_llm" | "gemini_byok";

export type SettingsRecord = {
  id: "settings";
  apiKey: string;
  geminiModel: string;
  llmApiUrl: string;
  localLlmModel: string;
  targetLanguage: string;
  targetLanguageCustomized: boolean;
  theme: ThemeName;
  ttsRate: number;
  ttsFollowPlayback: boolean;
  ttsVoice: string;
  ttsVolume: number;
  fontScale: number;
  readingMode: ReadingMode;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  paragraphIndent: number;
  contentPadding: number;
  contentBackgroundColor: string;
  maxLineWidth: number;
  columnCount: 1 | 2;
  fontFamily: ReaderFontFamily;
  translationProvider: TranslationProvider;
};

export type SettingsInput = Omit<SettingsRecord, "id">;
export type SettingsPatch = Partial<SettingsInput>;
