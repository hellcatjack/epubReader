import type { LlmReasoningEffort, TranslationProvider } from "../../lib/types/settings";

export const translationProviderOptions: Array<{ label: string; value: TranslationProvider }> = [
  { label: "Local LLM", value: "local_llm" },
  { label: "Gemini BYOK", value: "gemini_byok" },
];

export const geminiModelOptions = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

export const llmReasoningEffortOptions: Array<{ label: string; value: LlmReasoningEffort }> = [
  { label: "Default", value: "default" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
