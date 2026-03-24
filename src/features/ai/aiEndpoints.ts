export const DEFAULT_LLM_API_URL = "http://localhost:8001/v1/chat/completions";

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";
const COMPLETIONS_SUFFIX = "/completions";
const MODELS_SUFFIX = "/models";

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveLlmApiEndpoints(input?: string) {
  const normalizedInput = trimTrailingSlashes(input?.trim() || DEFAULT_LLM_API_URL);

  if (normalizedInput.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    return {
      chatCompletionsEndpoint: normalizedInput,
      completionsEndpoint: `${normalizedInput.slice(0, -CHAT_COMPLETIONS_SUFFIX.length)}${COMPLETIONS_SUFFIX}`,
      modelsEndpoint: `${normalizedInput.slice(0, -CHAT_COMPLETIONS_SUFFIX.length)}${MODELS_SUFFIX}`,
    };
  }

  if (normalizedInput.endsWith(COMPLETIONS_SUFFIX)) {
    return {
      chatCompletionsEndpoint: `${normalizedInput.slice(0, -COMPLETIONS_SUFFIX.length)}${CHAT_COMPLETIONS_SUFFIX}`,
      completionsEndpoint: normalizedInput,
      modelsEndpoint: `${normalizedInput.slice(0, -COMPLETIONS_SUFFIX.length)}${MODELS_SUFFIX}`,
    };
  }

  return {
    chatCompletionsEndpoint: `${normalizedInput}${CHAT_COMPLETIONS_SUFFIX}`,
    completionsEndpoint: `${normalizedInput}${COMPLETIONS_SUFFIX}`,
    modelsEndpoint: `${normalizedInput}${MODELS_SUFFIX}`,
  };
}
