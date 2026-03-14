type FetchLike = typeof fetch;

type RequestContext = {
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

const DEFAULT_CHAT_COMPLETIONS_URL = "http://192.168.1.31:8001/v1/chat/completions";

function describeLanguage(targetLanguage: string) {
  if (targetLanguage === "zh-CN") {
    return "Simplified Chinese";
  }

  if (targetLanguage === "en") {
    return "English";
  }

  return targetLanguage;
}

function createTextPrompt(kind: "translate" | "explain", text: string, targetLanguage: string) {
  if (kind === "translate") {
    return `Translate the following reading selection into ${describeLanguage(targetLanguage)}. Return only the translation.\n\n${text}`;
  }

  return [
    "Explain the following reading selection briefly and bilingually.",
    "Return two short sections in this order:",
    "1. Chinese explanation",
    "2. English explanation",
    "",
    text,
  ].join("\n");
}

function createSystemPrompt(kind: "translate" | "explain", targetLanguage: string) {
  if (kind === "translate") {
    return `You are an EPUB reader assistant. Reply only in ${describeLanguage(targetLanguage)}.`;
  }

  return "You are an EPUB reader assistant. For explanation requests, always answer with a concise Chinese explanation followed by a concise English explanation.";
}

function createExplainSectionPrompt(text: string, language: "zh-CN" | "en") {
  if (language === "zh-CN") {
    return `Explain the following reading selection in Simplified Chinese. Return only the explanation.\n\n${text}`;
  }

  return `Explain the following reading selection in English. Return only the explanation.\n\n${text}`;
}

function extractOutputText(payload: unknown) {
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

async function assertOk(response: Response) {
  if (response.ok) {
    return response;
  }

  throw response;
}

async function requestText(
  fetchFn: FetchLike,
  endpoint: string,
  textModel: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  signal?: AbortSignal,
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
    }),
  });

  await assertOk(response);
  const payload = await response.json();
  return extractOutputText(payload);
}

async function requestBilingualExplain(
  fetchFn: FetchLike,
  endpoint: string,
  textModel: string,
  text: string,
  context: RequestContext,
) {
  const [chineseExplanation, englishExplanation] = await Promise.all([
    requestText(
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
    requestText(
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
  endpoint = DEFAULT_CHAT_COMPLETIONS_URL,
  textModel = "local-reader-chat",
}: OpenAIAdapterDeps = {}) {
  return {
    translateSelection(text: string, context: RequestContext) {
      return requestText(
        fetchFn,
        endpoint,
        textModel,
        [
          {
            role: "system",
            content: createSystemPrompt("translate", context.targetLanguage),
          },
          {
            role: "user",
            content: createTextPrompt("translate", text, context.targetLanguage),
          },
        ],
        context.signal,
      ).catch((error) => {
        throw normalizeOpenAIError(error);
      });
    },
    explainSelection(text: string, context: RequestContext) {
      return requestBilingualExplain(fetchFn, endpoint, textModel, text, context).catch((error) => {
        throw normalizeOpenAIError(error);
      });
    },
    async synthesizeSpeech(_text: string, _options: SpeechOptions) {
      throw { kind: "unsupported" } satisfies OpenAIError;
    },
  };
}
