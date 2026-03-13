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
  apiKey: string;
  fetch?: FetchLike;
  speechModel?: string;
  textModel?: string;
};

type OpenAIErrorKind =
  | "aborted"
  | "auth"
  | "network-or-cors"
  | "provider"
  | "quota-or-billing";

export type OpenAIError = {
  kind: OpenAIErrorKind;
};

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const SPEECH_URL = "https://api.openai.com/v1/audio/speech";

function createAuthHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

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

  const output = Reflect.get(payload, "output");
  if (!Array.isArray(output)) {
    return "";
  }

  const textParts = output.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const content = Reflect.get(item, "content");
    if (!Array.isArray(content)) {
      return [];
    }

    return content.flatMap((contentItem) => {
      if (!contentItem || typeof contentItem !== "object") {
        return [];
      }

      if (Reflect.get(contentItem, "type") !== "output_text") {
        return [];
      }

      const text = Reflect.get(contentItem, "text");
      return typeof text === "string" ? [text] : [];
    });
  });

  return textParts.join("\n").trim();
}

async function assertOk(response: Response) {
  if (response.ok) {
    return response;
  }

  throw response;
}

async function requestText(
  fetchFn: FetchLike,
  apiKey: string,
  textModel: string,
  kind: "translate" | "explain",
  text: string,
  context: RequestContext,
) {
  const response = await fetchFn(RESPONSES_URL, {
    method: "POST",
    headers: createAuthHeaders(apiKey),
    signal: context.signal,
    body: JSON.stringify({
      model: textModel,
      input: createTextPrompt(kind, text, context.targetLanguage),
    }),
  });

  await assertOk(response);
  const payload = await response.json();
  return extractOutputText(payload);
}

async function requestSpeech(
  fetchFn: FetchLike,
  apiKey: string,
  speechModel: string,
  text: string,
  options: SpeechOptions,
) {
  const response = await fetchFn(SPEECH_URL, {
    method: "POST",
    headers: createAuthHeaders(apiKey),
    signal: options.signal,
    body: JSON.stringify({
      model: speechModel,
      input: text,
      voice: options.voice,
      response_format: "mp3",
    }),
  });

  await assertOk(response);
  return response.blob();
}

export function normalizeOpenAIError(error: unknown): OpenAIError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { kind: "aborted" };
  }

  if (error instanceof TypeError) {
    return { kind: "network-or-cors" };
  }

  if (error instanceof Response) {
    if (error.status === 401 || error.status === 403) {
      return { kind: "auth" };
    }

    if (error.status === 402 || error.status === 429) {
      return { kind: "quota-or-billing" };
    }

    return { kind: "provider" };
  }

  return { kind: "provider" };
}

export function createOpenAIAdapter({
  apiKey,
  fetch: fetchFn = fetch,
  speechModel = "gpt-4o-mini-tts",
  textModel = "gpt-4.1",
}: OpenAIAdapterDeps) {
  return {
    translateSelection(text: string, context: RequestContext) {
      return requestText(fetchFn, apiKey, textModel, "translate", text, context);
    },
    explainSelection(text: string, context: RequestContext) {
      return requestText(fetchFn, apiKey, textModel, "explain", text, context);
    },
    synthesizeSpeech(text: string, options: SpeechOptions) {
      return requestSpeech(fetchFn, apiKey, speechModel, text, options);
    },
  };
}
