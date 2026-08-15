import { expect, it, vi } from "vitest";
import { defaultSettings } from "../settings/settingsRepository";
import { createAiService } from "./aiService";

it("uses the saved local llm settings when creating the local ai adapter", async () => {
  const translateSelection = vi.fn().mockResolvedValue("翻译");
  const explainSelection = vi.fn().mockResolvedValue("解释");
  const synthesizeSpeech = vi.fn().mockResolvedValue({ audio: "" });
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    llmApiKey: "translation-token",
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
    apiKey: "translation-token",
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

it("routes explain requests through grammar-specific endpoint and model when configured", async () => {
  const translateSelection = vi.fn().mockResolvedValue("翻译");
  const explainSelection = vi.fn().mockResolvedValue("语法解析");
  const defineSelection = vi.fn().mockResolvedValue("english definition");
  const synthesizeSpeech = vi.fn().mockResolvedValue({ audio: "" });
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    grammarLlmApiUrl: "http://localhost:9001/v1/chat/completions",
    grammarLlmModel: "grammar-model",
    llmApiUrl: "http://localhost:1234/v1",
    localLlmModel: "translation-model",
    translationProvider: "local_llm",
  });
  const createLocalAdapter = vi
    .fn()
    .mockReturnValueOnce({
      defineSelection,
      explainSelection,
      synthesizeSpeech,
      translateSelection,
    })
    .mockReturnValue({
      defineSelection,
      explainSelection,
      synthesizeSpeech,
      translateSelection,
    });
  const createGeminiAdapter = vi.fn();
  const service = createAiService({ createGeminiAdapter, createLocalAdapter, loadSettings });

  await expect(
    service.explainSelection("Despite himself, Ender's voice trembled.", { targetLanguage: "zh-CN" }),
  ).resolves.toBe("语法解析");

  expect(createLocalAdapter).toHaveBeenCalledWith({
    endpoint: "http://localhost:9001/v1/chat/completions",
    textModel: "grammar-model",
  });
});

it("routes explain through inherited endpoint with grammar token, model, and reasoning effort", async () => {
  const explainSelection = vi.fn().mockResolvedValue("语法解析");
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    grammarLlmApiKey: "grammar-token",
    grammarLlmModel: "grammar-model",
    grammarLlmReasoningEffort: "high",
    llmApiKey: "translation-token",
    llmApiUrl: "https://example.test/openai/v1",
    localLlmModel: "translation-model",
    translationProvider: "local_llm",
  });
  const createLocalAdapter = vi.fn().mockReturnValue({
    explainSelection,
  });
  const service = createAiService({ createLocalAdapter, loadSettings });

  await expect(service.explainSelection("A difficult sentence.", { targetLanguage: "zh-CN" })).resolves.toBe(
    "语法解析",
  );

  expect(createLocalAdapter).toHaveBeenCalledWith({
    apiKey: "grammar-token",
    endpoint: "https://example.test/openai/v1",
    reasoningEffort: "high",
    textModel: "grammar-model",
  });
});

it("inherits the normal local token and model when grammar values are blank", async () => {
  const explainSelection = vi.fn().mockResolvedValue("语法解析");
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    llmApiKey: "translation-token",
    llmApiUrl: "https://example.test/openai/v1",
    localLlmModel: "translation-model",
    translationProvider: "local_llm",
  });
  const createLocalAdapter = vi.fn().mockReturnValue({
    explainSelection,
  });
  const service = createAiService({ createLocalAdapter, loadSettings });

  await service.explainSelection("A sentence.", { targetLanguage: "zh-CN" });

  expect(createLocalAdapter).toHaveBeenCalledWith({
    apiKey: "translation-token",
    endpoint: "https://example.test/openai/v1",
    textModel: "translation-model",
  });
});

it("routes english definition requests through the explain adapter configuration", async () => {
  const translateSelection = vi.fn().mockResolvedValue("翻译");
  const explainSelection = vi.fn().mockResolvedValue("语法解析");
  const defineSelection = vi.fn().mockResolvedValue("english definition");
  const synthesizeSpeech = vi.fn().mockResolvedValue({ audio: "" });
  const loadSettings = vi.fn().mockResolvedValue({
    ...defaultSettings,
    grammarLlmApiUrl: "http://localhost:9001/v1/chat/completions",
    grammarLlmModel: "grammar-model",
    llmApiUrl: "http://localhost:1234/v1",
    localLlmModel: "translation-model",
    translationProvider: "local_llm",
  });
  const createLocalAdapter = vi
    .fn()
    .mockReturnValueOnce({
      defineSelection,
      explainSelection,
      synthesizeSpeech,
      translateSelection,
    })
    .mockReturnValue({
      defineSelection,
      explainSelection,
      synthesizeSpeech,
      translateSelection,
    });
  const createGeminiAdapter = vi.fn();
  const service = createAiService({ createGeminiAdapter, createLocalAdapter, loadSettings });

  await expect(
    service.defineSelection("pressed", {
      sentenceContext: "She looked pressed for time before the meeting.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("english definition");

  expect(createLocalAdapter).toHaveBeenCalledWith({
    endpoint: "http://localhost:9001/v1/chat/completions",
    textModel: "grammar-model",
  });
  expect(defineSelection).toHaveBeenCalledWith("pressed", {
    sentenceContext: "She looked pressed for time before the meeting.",
    targetLanguage: "zh-CN",
  });
});
