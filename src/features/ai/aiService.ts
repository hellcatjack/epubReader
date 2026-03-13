import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";

type ServiceContext = {
  apiKey: string;
  signal?: AbortSignal;
  targetLanguage: string;
};

type SpeechContext = {
  apiKey: string;
  signal?: AbortSignal;
  voice: string;
};

export function createAiService() {
  return {
    async translateSelection(text: string, context: ServiceContext) {
      try {
        return await createOpenAIAdapter({ apiKey: context.apiKey }).translateSelection(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
    async explainSelection(text: string, context: ServiceContext) {
      try {
        return await createOpenAIAdapter({ apiKey: context.apiKey }).explainSelection(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
    async synthesizeSpeech(text: string, context: SpeechContext) {
      try {
        return await createOpenAIAdapter({ apiKey: context.apiKey }).synthesizeSpeech(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
  };
}

export const aiService = createAiService();
