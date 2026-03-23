import { getResolvedSettings } from "../settings/settingsRepository";
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
  createAdapter?: typeof createOpenAIAdapter;
  loadSettings?: typeof getResolvedSettings;
};

export function createAiService({ createAdapter = createOpenAIAdapter, loadSettings = getResolvedSettings }: AiServiceDeps = {}) {
  async function getAdapter() {
    const settings = await loadSettings();
    const endpoint = settings.llmApiUrl.trim();
    return createAdapter(endpoint ? { endpoint } : {});
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
        return await (await getAdapter()).explainSelection(text, context);
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
