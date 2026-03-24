import { expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/settingsRepository";
import { createAiService } from "./aiService";

it("uses the saved local llm settings when creating the local ai adapter", async () => {
  const translateSelection = vi.fn().mockResolvedValue("翻译");
  const explainSelection = vi.fn().mockResolvedValue("解释");
  const synthesizeSpeech = vi.fn().mockResolvedValue({ audio: "" });
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    localLlmModel: "phi-4-mini",
    llmApiUrl: "http://localhost:1234/v1",
    translationProvider: "local_llm",
  });
  const createLocalAdapter = vi.fn().mockReturnValue({
    explainSelection,
    synthesizeSpeech,
    translateSelection,
  });
  const createGeminiAdapter = vi.fn();
  const service = createAiService({ createGeminiAdapter, createLocalAdapter, loadSettings });

  await expect(service.translateSelection("hello", { targetLanguage: "zh-CN" })).resolves.toBe("翻译");

  expect(loadSettings).toHaveBeenCalledTimes(1);
  expect(createLocalAdapter).toHaveBeenCalledWith({
    endpoint: "http://localhost:1234/v1",
    textModel: "phi-4-mini",
  });
  expect(createGeminiAdapter).not.toHaveBeenCalled();
  expect(translateSelection).toHaveBeenCalledWith("hello", { targetLanguage: "zh-CN" });
});

it("routes translation requests through the gemini adapter when gemini byok is selected", async () => {
  const translateSelection = vi.fn().mockResolvedValue("在线翻译");
  const explainSelection = vi.fn().mockResolvedValue("在线解释");
  const synthesizeSpeech = vi.fn().mockRejectedValue({ kind: "unsupported" });
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    apiKey: "gemini-secret-key",
    geminiModel: "gemini-2.5-flash-lite",
    translationProvider: "gemini_byok",
  });
  const createGeminiAdapter = vi.fn().mockReturnValue({
    explainSelection,
    synthesizeSpeech,
    translateSelection,
  });
  const createLocalAdapter = vi.fn();
  const service = createAiService({ createGeminiAdapter, createLocalAdapter, loadSettings });

  await expect(service.translateSelection("hello", { targetLanguage: "zh-CN" })).resolves.toBe("在线翻译");

  expect(createGeminiAdapter).toHaveBeenCalledWith({
    apiKey: "gemini-secret-key",
    textModel: "gemini-2.5-flash-lite",
  });
  expect(createLocalAdapter).not.toHaveBeenCalled();
});
