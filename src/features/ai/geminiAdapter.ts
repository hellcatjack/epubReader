import {
  buildSelectionTranslationPrompt,
  cleanupSelectionTranslationOutput,
  shouldRetrySelectionGloss,
  type SelectionTranslationMode,
} from "./selectionTranslation";

type FetchLike = typeof fetch;

type RequestContext = {
  sentenceContext?: string;
  signal?: AbortSignal;
  targetLanguage: string;
};

type SpeechOptions = {
  signal?: AbortSignal;
  voice: string;
};

type GeminiAdapterDeps = {
  apiKey: string;
  fetch?: FetchLike;
  textModel?: string;
};

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function createExplainSectionPrompt(text: string, language: "zh-CN" | "en") {
  if (language === "zh-CN") {
    return `Explain the following reading selection in Simplified Chinese. Return only the explanation.\n\n${text}`;
  }

  return `Explain the following reading selection in English. Return only the explanation.\n\n${text}`;
}

function getGenerateContentEndpoint(model: string) {
  return `${GEMINI_API_BASE}/${model}:generateContent`;
}

function extractGenerateContentText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = Reflect.get(payload, "candidates");
  if (!Array.isArray(candidates)) {
    return "";
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const content = Reflect.get(candidate, "content");
    if (!content || typeof content !== "object") {
      continue;
    }

    const parts = Reflect.get(content, "parts");
    if (!Array.isArray(parts)) {
      continue;
    }

    const text = parts
      .map((part) => (part && typeof part === "object" ? Reflect.get(part, "text") : ""))
      .filter((part): part is string => typeof part === "string")
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

function getTemperature(mode: SelectionTranslationMode) {
  return mode === "sentence" ? 0.2 : 0.1;
}

async function assertOk(response: Response) {
  if (response.ok) {
    return response;
  }

  throw response;
}

async function requestGenerateContent(
  fetchFn: FetchLike,
  endpoint: string,
  apiKey: string,
  prompt: string,
  mode: SelectionTranslationMode,
  signal?: AbortSignal,
) {
  const response = await fetchFn(endpoint, {
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
          role: "user",
        },
      ],
      generationConfig: {
        temperature: getTemperature(mode),
      },
    }),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    method: "POST",
    signal,
  });

  await assertOk(response);
  const payload = await response.json();
  return extractGenerateContentText(payload);
}

async function requestSelectionTranslation(
  fetchFn: FetchLike,
  endpoint: string,
  apiKey: string,
  text: string,
  context: RequestContext,
) {
  const firstPass = buildSelectionTranslationPrompt({
    sentenceContext: context.sentenceContext,
    targetLanguage: context.targetLanguage,
    text,
  });
  const initialOutput = await requestGenerateContent(
    fetchFn,
    endpoint,
    apiKey,
    firstPass.prompt,
    firstPass.mode,
    context.signal,
  );

  if (!shouldRetrySelectionGloss(initialOutput, firstPass.mode)) {
    return cleanupSelectionTranslationOutput(initialOutput, firstPass.mode);
  }

  const strictPass = buildSelectionTranslationPrompt({
    sentenceContext: context.sentenceContext,
    strict: true,
    targetLanguage: context.targetLanguage,
    text,
  });
  const retryOutput = await requestGenerateContent(
    fetchFn,
    endpoint,
    apiKey,
    strictPass.prompt,
    strictPass.mode,
    context.signal,
  );

  return cleanupSelectionTranslationOutput(retryOutput, strictPass.mode);
}

async function requestBilingualExplain(
  fetchFn: FetchLike,
  endpoint: string,
  apiKey: string,
  text: string,
  context: RequestContext,
) {
  const [chineseExplanation, englishExplanation] = await Promise.all([
    requestGenerateContent(fetchFn, endpoint, apiKey, createExplainSectionPrompt(text, "zh-CN"), "sentence", context.signal),
    requestGenerateContent(fetchFn, endpoint, apiKey, createExplainSectionPrompt(text, "en"), "sentence", context.signal),
  ]);

  return `中文解释：${chineseExplanation}\n\nEnglish explanation: ${englishExplanation}`;
}

export function createGeminiAdapter({
  apiKey,
  fetch: fetchFn = fetch,
  textModel = DEFAULT_GEMINI_MODEL,
}: GeminiAdapterDeps) {
  const endpoint = getGenerateContentEndpoint(textModel);

  return {
    translateSelection(text: string, context: RequestContext) {
      return requestSelectionTranslation(fetchFn, endpoint, apiKey, text, context);
    },
    explainSelection(text: string, context: RequestContext) {
      return requestBilingualExplain(fetchFn, endpoint, apiKey, text, context);
    },
    async synthesizeSpeech(_text: string, _options: SpeechOptions) {
      throw { kind: "unsupported" } as const;
    },
  };
}
