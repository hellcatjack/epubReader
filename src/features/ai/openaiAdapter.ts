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

function createTextPrompt(kind: "translate" | "explain", text: string, targetLanguage: string) {
  if (kind === "translate") {
    return `Translate the following text into ${targetLanguage}. Return only the translation.\n\n${text}`;
  }

  return `Explain the following reading selection in ${targetLanguage}. Keep it concise and contextual.\n\n${text}`;
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
  kind: "translate" | "explain",
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
      model: textModel,
      messages: [
        {
          role: "system",
          content: `You are an EPUB reader assistant. Reply in ${context.targetLanguage}.`,
        },
        {
          role: "user",
          content: createTextPrompt(kind, text, context.targetLanguage),
        },
      ],
    }),
  });

  await assertOk(response);
  const payload = await response.json();
  return extractOutputText(payload);
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
      return requestText(fetchFn, endpoint, textModel, "translate", text, context).catch((error) => {
        throw normalizeOpenAIError(error);
      });
    },
    explainSelection(text: string, context: RequestContext) {
      return requestText(fetchFn, endpoint, textModel, "explain", text, context).catch((error) => {
        throw normalizeOpenAIError(error);
      });
    },
    async synthesizeSpeech(_text: string, _options: SpeechOptions) {
      throw { kind: "unsupported" } satisfies OpenAIError;
    },
  };
}
