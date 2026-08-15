import { getResolvedSettings } from "../settings/settingsRepository";
import { createGeminiAdapter } from "./geminiAdapter";
import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";

type ServiceContext = {
  sentenceContext?: string;
  signal?: AbortSignal;
  targetLanguage: string;
};

type SpeechContext = {
  rate: number;
  signal?: AbortSignal;
  voice: string;
  volume: number;
};

type AiServiceDeps = {
  createGeminiAdapter?: typeof createGeminiAdapter;
  createLocalAdapter?: typeof createOpenAIAdapter;
  loadSettings?: typeof getResolvedSettings;
};

export function createAiService({
  createGeminiAdapter: buildGeminiAdapter = createGeminiAdapter,
  createLocalAdapter = createOpenAIAdapter,
  loadSettings = getResolvedSettings,
}: AiServiceDeps = {}) {
  async function getAdapter() {
    const settings = await loadSettings();
    if (settings.translationProvider === "gemini_byok") {
      return buildGeminiAdapter({
        apiKey: settings.apiKey.trim(),
        textModel: settings.geminiModel.trim() || undefined,
      });
    }

    const endpoint = settings.llmApiUrl.trim();
    const apiKey = settings.llmApiKey.trim();
    const textModel = settings.localLlmModel.trim();
    return createLocalAdapter({
      ...(apiKey ? { apiKey } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(textModel ? { textModel } : {}),
    });
  }

  async function getExplainAdapter() {
    const settings = await loadSettings();
    const grammarEndpoint = settings.grammarLlmApiUrl.trim();
    const grammarApiKey = settings.grammarLlmApiKey.trim();
    const grammarModel = settings.grammarLlmModel.trim();
    const reasoningEffort = settings.grammarLlmReasoningEffort;

    if (grammarEndpoint || grammarApiKey || grammarModel || reasoningEffort !== "default") {
      const endpoint = grammarEndpoint || settings.llmApiUrl.trim();
      const apiKey = grammarApiKey || settings.llmApiKey.trim();
      const textModel = grammarModel || settings.localLlmModel.trim();
      return createLocalAdapter({
        ...(apiKey ? { apiKey } : {}),
        ...(endpoint ? { endpoint } : {}),
        ...(reasoningEffort !== "default" ? { reasoningEffort } : {}),
        ...(textModel ? { textModel } : {}),
      });
    }

    if (settings.translationProvider === "gemini_byok") {
      return buildGeminiAdapter({
        apiKey: settings.apiKey.trim(),
        textModel: settings.geminiModel.trim() || undefined,
      });
    }

    const endpoint = settings.llmApiUrl.trim();
    const apiKey = settings.llmApiKey.trim();
    const textModel = settings.localLlmModel.trim();
    return createLocalAdapter({
      ...(apiKey ? { apiKey } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(textModel ? { textModel } : {}),
    });
  }

  return {
    async translateSelection(text: string, context: ServiceContext) {
      try {
        return await (await getAdapter()).translateSelection(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
    async explainSelection(text: string, context: ServiceContext) {
      try {
        return await (await getExplainAdapter()).explainSelection(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
    async defineSelection(text: string, context: ServiceContext) {
      try {
        return await (await getExplainAdapter()).defineSelection(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
    async synthesizeSpeech(text: string, context: SpeechContext) {
      try {
        return await (await getAdapter()).synthesizeSpeech(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
export const aiService = createAiService();
