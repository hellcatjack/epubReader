import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";
import { createLocalTtsClient } from "../tts/localTtsClient";

type ServiceContext = {
  signal?: AbortSignal;
  targetLanguage: string;
};

type SpeechContext = {
  helperUrl: string;
  rate: number;
  signal?: AbortSignal;
  voice: string;
  volume: number;
};

export function createAiService() {
  return {
    async translateSelection(text: string, context: ServiceContext) {
      try {
        return await createOpenAIAdapter().translateSelection(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
    async explainSelection(text: string, context: ServiceContext) {
      try {
        return await createOpenAIAdapter().explainSelection(text, context);
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
    async synthesizeSpeech(text: string, context: SpeechContext) {
      try {
        return await createLocalTtsClient({ baseUrl: context.helperUrl }).speak({
          format: "wav",
          rate: context.rate,
          text,
          voiceId: context.voice,
          volume: context.volume,
        });
      } catch (error) {
        throw normalizeOpenAIError(error);
      }
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
export const aiService = createAiService();
