import {
  buildSelectionTranslationPrompt,
  cleanupSelectionTranslationOutput,
  type SelectionTranslationMode,
} from "./selectionTranslation";
import { DEFAULT_LLM_API_URL, resolveLlmApiEndpoints } from "./aiEndpoints";
import {
  createGrammarExplainSystemPrompt,
  createGrammarExplainUserPrompt,
  extractGrammarExplainAnswer,
} from "./grammarExplainPrompt";

type FetchLike = typeof fetch;

type RequestContext = {
  sentenceContext?: string;
  targetLanguage: string;
  signal?: AbortSignal;
};

type SpeechOptions = {
  signal?: AbortSignal;
  voice: string;
};

type OpenAIAdapterDeps = {
  fetch?: FetchLike;
  endpoint?: string;
  completionEndpoint?: string;
  textModel?: string;
};

type OpenAIErrorKind =
  | "aborted"
  | "network-or-cors"
  | "provider"
  | "quota-or-billing"
  | "unsupported";

export type OpenAIError = {
  kind: OpenAIErrorKind;
};

function extractChatOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = Reflect.get(payload, "choices");
  if (!Array.isArray(choices)) {
    return "";
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return "";
  }

  const message = Reflect.get(firstChoice, "message");
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = Reflect.get(message, "content");
  return typeof content === "string" ? content.trim() : "";
}

function extractCompletionOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = Reflect.get(payload, "choices");
  if (!Array.isArray(choices)) {
    return "";
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return "";
  }

  const text = Reflect.get(firstChoice, "text");
  return typeof text === "string" ? text.trim() : "";
}

async function assertOk(response: Response) {
  if (response.ok) {
    return response;
  }

  throw response;
}

async function requestChatText(
  fetchFn: FetchLike,
  endpoint: string,
  textModel: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal?: AbortSignal,
  extraBody?: Record<string, unknown>,
) {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: textModel,
      messages,
      ...(extraBody ?? {}),
    }),
  });

  await assertOk(response);
  const payload = await response.json();
  return extractChatOutputText(payload);
}

function getCompletionMaxTokens(mode: SelectionTranslationMode) {
  if (mode === "word") {
    return 24;
  }

  if (mode === "phrase") {
    return 48;
  }

  return 160;
}

function getCompletionStop(mode: SelectionTranslationMode) {
  if (mode === "sentence") {
    return undefined;
  }

  return ["，", ",", "\n"];
}

function getCompletionSamplingOptions(mode: SelectionTranslationMode) {
  return {
    temperature: mode === "sentence" ? 0.2 : 0.1,
  };
}

async function requestCompletionText(
  fetchFn: FetchLike,
  endpoint: string,
  textModel: string,
  prompt: string,
  mode: SelectionTranslationMode,
  signal?: AbortSignal,
) {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      max_tokens: getCompletionMaxTokens(mode),
      model: textModel,
      prompt,
      ...(getCompletionStop(mode) ? { stop: getCompletionStop(mode) } : {}),
      ...getCompletionSamplingOptions(mode),
    }),
  });

  await assertOk(response);
  const payload = await response.json();
  return extractCompletionOutputText(payload);
}

async function requestSelectionTranslation(
  fetchFn: FetchLike,
  completionEndpoint: string,
  textModel: string,
  text: string,
  context: RequestContext,
) {
  const firstPass = buildSelectionTranslationPrompt({
    sentenceContext: context.sentenceContext,
    targetLanguage: context.targetLanguage,
    text,
    textModel,
  });

  const initialOutput = await requestCompletionText(
    fetchFn,
    completionEndpoint,
    textModel,
    firstPass.prompt,
    firstPass.mode,
    context.signal,
  );
  const cleanedInitialOutput = cleanupSelectionTranslationOutput(initialOutput, firstPass.mode);
  return cleanedInitialOutput;
}

async function requestGrammarExplain(
  fetchFn: FetchLike,
  endpoint: string,
  textModel: string,
  text: string,
  context: RequestContext,
) {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: context.signal,
    body: JSON.stringify({
      chat_template_kwargs: {
        enable_thinking: false,
      },
      max_tokens: 1400,
      model: textModel,
      messages: [
        {
          role: "system",
          content: createGrammarExplainSystemPrompt(),
        },
        {
          role: "user",
          content: createGrammarExplainUserPrompt(text),
        },
      ],
      temperature: 0.2,
    }),
  });

  await assertOk(response);
  const payload = await response.json();
  return extractGrammarExplainAnswer(
    extractChatOutputText(payload),
  );
}

export function normalizeOpenAIError(error: unknown): OpenAIError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { kind: "aborted" };
  }

  if (error instanceof TypeError) {
    return { kind: "network-or-cors" };
  }

  if (error instanceof Response) {
    if (error.status === 402 || error.status === 429) {
      return { kind: "quota-or-billing" };
    }

    return { kind: "provider" };
  }

  if (error instanceof Error && error.message === "unsupported") {
    return { kind: "unsupported" };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    Reflect.get(error, "kind") === "unsupported"
  ) {
    return { kind: "unsupported" };
  }

  return { kind: "provider" };
}

export function createOpenAIAdapter({
  fetch: fetchFn = fetch,
  endpoint = DEFAULT_LLM_API_URL,
  completionEndpoint,
  textModel = "local-reader-chat",
}: OpenAIAdapterDeps = {}) {
  const resolvedEndpoints = resolveLlmApiEndpoints(endpoint);
  const chatEndpoint = resolvedEndpoints.chatCompletionsEndpoint;
  const resolvedCompletionEndpoint = completionEndpoint || resolvedEndpoints.completionsEndpoint;

  return {
    translateSelection(text: string, context: RequestContext) {
      return requestSelectionTranslation(fetchFn, resolvedCompletionEndpoint, textModel, text, context).catch(
        (error) => {
          throw normalizeOpenAIError(error);
        },
      );
    },
    explainSelection(text: string, context: RequestContext) {
      return requestGrammarExplain(fetchFn, chatEndpoint, textModel, text, context).catch((error) => {
        throw normalizeOpenAIError(error);
      });
    },
    async synthesizeSpeech(_text: string, _options: SpeechOptions) {
      throw { kind: "unsupported" } satisfies OpenAIError;
    },
  };
}
