import {
  buildSelectionTranslationPrompt,
  cleanupSelectionTranslationOutput,
  type SelectionTranslationMode,
} from "./selectionTranslation";
import { DEFAULT_LLM_API_URL, resolveLlmApiEndpoints } from "./aiEndpoints";

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

function createExplainSectionPrompt(text: string, language: "zh-CN" | "en") {
  if (language === "zh-CN") {
    return `Explain the following reading selection in Simplified Chinese. Return only the explanation.\n\n${text}`;
  }

  return `Explain the following reading selection in English. Return only the explanation.\n\n${text}`;
}

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
  extraBody?: Record<string, number>,
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

function normalizeModelName(textModel: string) {
  const normalized = textModel.trim();
  if (!normalized) {
    return "";
  }

  const withoutNamespace = normalized.split("/").at(-1) ?? normalized;
  return withoutNamespace.split(":")[0]?.trim() ?? withoutNamespace;
}

function isHunyuanMtModel(textModel: string) {
  return normalizeModelName(textModel).includes("HY-MT1.5");
}

function getHunyuanChatSamplingOptions(strict = false) {
  if (strict) {
    return {
      temperature: 0,
      top_p: 1,
    };
  }

  return {
    temperature: 0.1,
    top_p: 0.9,
  };
}

function hasMixedScriptToken(output: string) {
  const tokens = output.match(/[\p{Script=Han}A-Za-z]+/gu) ?? [];
  return tokens.some((token) => /[\p{Script=Han}]/u.test(token) && /[A-Za-z]/.test(token));
}

function getCompletionSamplingOptions(textModel: string, mode: SelectionTranslationMode) {
  if (isHunyuanMtModel(textModel)) {
    return {
      repetition_penalty: 1.05,
      temperature: 0.7,
      top_k: 20,
      top_p: 0.6,
    };
  }

  return {
    temperature: mode === "sentence" ? 0.2 : 0.1,
  };
}

function wrapCompletionPrompt(textModel: string, prompt: string) {
  if (isHunyuanMtModel(textModel)) {
    return `<｜hy_begin▁of▁sentence｜><｜hy_User｜>${prompt}<｜hy_Assistant｜>`;
  }

  return prompt;
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
      prompt: wrapCompletionPrompt(textModel, prompt),
      ...(getCompletionStop(mode) ? { stop: getCompletionStop(mode) } : {}),
      ...getCompletionSamplingOptions(textModel, mode),
    }),
  });

  await assertOk(response);
  const payload = await response.json();
  return extractCompletionOutputText(payload);
}

async function requestSelectionTranslation(
  fetchFn: FetchLike,
  completionEndpoint: string,
  chatEndpoint: string,
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

  if (isHunyuanMtModel(textModel)) {
    const translationMessages = [
      {
        role: "system" as const,
        content: "You are an EPUB reader assistant. Reply only with the translation.",
      },
      {
        role: "user" as const,
        content: firstPass.prompt,
      },
    ];

    let output = await requestChatText(
      fetchFn,
      chatEndpoint,
      textModel,
      translationMessages,
      context.signal,
      getHunyuanChatSamplingOptions(),
    );

    if (context.targetLanguage === "zh-CN" && hasMixedScriptToken(output)) {
      output = await requestChatText(
        fetchFn,
        chatEndpoint,
        textModel,
        translationMessages,
        context.signal,
        getHunyuanChatSamplingOptions(true),
      );
    }

    if (firstPass.mode === "sentence") {
      return output;
    }

    return cleanupSelectionTranslationOutput(output, firstPass.mode);
  }

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

async function requestBilingualExplain(
  fetchFn: FetchLike,
  endpoint: string,
  textModel: string,
  text: string,
  context: RequestContext,
) {
  const [chineseExplanation, englishExplanation] = await Promise.all([
    requestChatText(
      fetchFn,
      endpoint,
      textModel,
      [
        {
          role: "system",
          content: "You are an EPUB reader assistant. Reply only in Simplified Chinese.",
        },
        {
          role: "user",
          content: createExplainSectionPrompt(text, "zh-CN"),
        },
      ],
      context.signal,
    ),
    requestChatText(
      fetchFn,
      endpoint,
      textModel,
      [
        {
          role: "system",
          content: "You are an EPUB reader assistant. Reply only in English.",
        },
        {
          role: "user",
          content: createExplainSectionPrompt(text, "en"),
        },
      ],
      context.signal,
    ),
  ]);

  return `中文解释：${chineseExplanation}\n\nEnglish explanation: ${englishExplanation}`;
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
      return requestSelectionTranslation(fetchFn, resolvedCompletionEndpoint, chatEndpoint, textModel, text, context).catch(
        (error) => {
          throw normalizeOpenAIError(error);
        },
      );
    },
    explainSelection(text: string, context: RequestContext) {
      return requestBilingualExplain(fetchFn, chatEndpoint, textModel, text, context).catch((error) => {
        throw normalizeOpenAIError(error);
      });
    },
    async synthesizeSpeech(_text: string, _options: SpeechOptions) {
      throw { kind: "unsupported" } satisfies OpenAIError;
    },
  };
}
