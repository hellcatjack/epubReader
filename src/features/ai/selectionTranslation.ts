export type SelectionTranslationMode = "word" | "phrase" | "sentence";
export type SingleWordClassHint = "noun" | "verb" | "unknown";
type TranslationPromptProfile = "default" | "hunyuan_mt";

type BuildSelectionTranslationPromptOptions = {
  sentenceContext?: string;
  strict?: boolean;
  targetLanguage: string;
  text: string;
  textModel?: string;
};

type SelectionTranslationPrompt = {
  mode: SelectionTranslationMode;
  prompt: string;
};

function describeLanguage(targetLanguage: string) {
  if (targetLanguage === "zh-CN") {
    return "简体中文";
  }

  if (targetLanguage === "en") {
    return "English";
  }

  return targetLanguage;
}

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”"‘’'`]+/g, "");
}

function looksLikeSingleWord(value: string) {
  return /^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u.test(value);
}

function normalizeLookupToken(value: string) {
  return normalizeText(value).toLowerCase().replace(/[’']/g, "'");
}

function tokenizeSentenceContext(value: string) {
  return Array.from(value.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)).map((match) => ({
    token: match[0],
  }));
}

const verbLeadInTokens = new Set([
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "who",
  "that",
  "which",
  "what",
  "to",
  "will",
  "would",
  "can",
  "could",
  "should",
  "shall",
  "may",
  "might",
  "must",
  "do",
  "does",
  "did",
  "not",
]);

const nounLeadInTokens = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
  "some",
  "any",
  "no",
  "each",
  "every",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "from",
  "of",
  "into",
  "after",
  "before",
  "under",
  "over",
  "through",
  "during",
  "without",
]);

export function inferLikelySingleWordClass(text: string, sentenceContext?: string): SingleWordClassHint {
  const normalizedText = normalizeText(text);
  const normalizedSentence = sentenceContext?.trim();
  if (!normalizedSentence || !looksLikeSingleWord(normalizedText)) {
    return "unknown";
  }

  const target = normalizeLookupToken(normalizedText);
  const tokens = tokenizeSentenceContext(normalizedSentence);
  const matchIndex = tokens.findIndex((token) => normalizeLookupToken(token.token) === target);
  if (matchIndex < 0) {
    return "unknown";
  }

  const previousToken = normalizeLookupToken(tokens[matchIndex - 1]?.token ?? "");
  if (!previousToken) {
    return "unknown";
  }

  if (verbLeadInTokens.has(previousToken)) {
    return "verb";
  }

  if (nounLeadInTokens.has(previousToken)) {
    return "noun";
  }

  return "noun";
}

function buildWordGlossPrompt(text: string, sentenceContext: string, targetLanguage: string, strict = false) {
  if (targetLanguage !== "zh-CN") {
    return [
      `You are an EPUB reader assistant. Based on the sentence, replace the selected word with the best short ${describeLanguage(targetLanguage)} fragment.`,
      "Rules:",
      "- Return only the replacement fragment for the selected word",
      "- Do not translate the whole sentence",
      "- Do not explain",
      "- Do not include surrounding sentence content",
      strict ? "- Previous answer spilled outside the selected word. Return only the shortest replacement fragment" : "- Keep it short",
      "",
      `Selected word: ${text}`,
      `Sentence: ${sentenceContext}`,
      "Answer:",
    ].join("\n");
  }

  return [
    "你是电子书阅读助手。请根据所在句子，把原句里的“选中词”替换成最合适的中文片段。",
    "要求：",
    "- 只输出替换“选中词”的中文片段",
    "- 这个片段必须只对应选中词本身",
    "- 输出应能直接替换该词",
    "- 不要翻译整句",
    "- 不要解释",
    "- 不要包含选区外信息",
    "- 不要编号、引号和句号",
    strict ? "- 上一次答案越界了，这次只保留最短可替换片段" : "- 长度控制在2到6个汉字",
    "",
    "示例：",
    "选中词：pressed",
    "所在句子：She looked pressed for time before the meeting.",
    "答案：时间紧迫",
    "",
    "选中词：pressed",
    "所在句子：The flowers were pressed between pages.",
    "答案：压平",
    "",
    "选中词：stick",
    "所在句子：Where else would you stick the oldest foster kid?",
    "答案：安置",
    "",
    `选中词：${text}`,
    `所在句子：${sentenceContext}`,
    "答案：",
  ].join("\n");
}

function buildPhraseGlossPrompt(text: string, sentenceContext: string, targetLanguage: string, strict = false) {
  if (targetLanguage !== "zh-CN") {
    return [
      `You are an EPUB reader assistant. Based on the sentence, return only the selected phrase meaning in ${describeLanguage(targetLanguage)}.`,
      "Rules:",
      "- Return only a short replacement for the selected phrase",
      "- Do not translate the whole sentence",
      "- Do not explain",
      "- Do not use quotes or end punctuation",
      strict ? "- Previous answer was sentence-like. Return a shorter phrase only" : "- Keep it concise",
      "",
      `Selected phrase: ${text}`,
      `Sentence: ${sentenceContext}`,
      "Answer:",
    ].join("\n");
  }

  return [
    "你是电子书阅读助手。请根据所在句子，给出“选中短语”在当前句中的自然中文表达。",
    "要求：",
    "- 只输出这个短语本身的中文含义",
    "- 不要翻译整句",
    "- 不要解释",
    "- 不要标点",
    "- 输出应能直接替换该短语",
    strict ? "- 上一次答案越界了，这次只保留最短可替换短语" : "- 长度控制在4到12个汉字",
    "",
    "示例：",
    "选中短语：looked up at her",
    "所在句子：She looked up at her when the door opened.",
    "答案：抬头看着她",
    "",
    "选中短语：pressed for time",
    "所在句子：She looked pressed for time before the meeting.",
    "答案：时间很紧",
    "",
    "选中短语：She’d lie on her stomach",
    "所在句子：She’d lie on her stomach, kick her feet in the air, and get lost.",
    "答案：她会趴着",
    "",
    `选中短语：${text}`,
    `所在句子：${sentenceContext}`,
    "答案：",
  ].join("\n");
}

function buildSentencePrompt(text: string, targetLanguage: string) {
  if (targetLanguage === "zh-CN") {
    return [
      "你是电子书阅读助手。请将下面的内容准确翻译成简体中文。",
      "要求：",
      "- 只输出译文",
      "- 不要解释",
      "",
      `待翻译内容：${text}`,
      "译文：",
    ].join("\n");
  }

  return [
    `You are an EPUB reader assistant. Translate the following text into ${describeLanguage(targetLanguage)}.`,
    "Rules:",
    "- Return translation only",
    "- Do not explain",
    "",
    `Text: ${text}`,
    "Translation:",
  ].join("\n");
}

function normalizeModelName(textModel?: string) {
  const normalized = (textModel ?? "").trim();
  if (!normalized) {
    return "";
  }

  const withoutNamespace = normalized.split("/").at(-1) ?? normalized;
  return withoutNamespace.split(":")[0]?.trim() ?? withoutNamespace;
}

function resolveTranslationPromptProfile(textModel?: string): TranslationPromptProfile {
  return normalizeModelName(textModel) === "HY-MT1.5-7B-GGUF" ? "hunyuan_mt" : "default";
}

function buildHunyuanWordPrompt(text: string, sentenceContext: string, targetLanguage: string, strict = false) {
  if (targetLanguage !== "zh-CN") {
    return [
      `Translate the selected word into ${describeLanguage(targetLanguage)} based on the sentence context, without extra explanation.`,
      "Rules:",
      "- The sentence is only for word-sense disambiguation",
      "- Translate only the selected word itself",
      "- Do not include adjacent nouns, objects, or complements",
      strict
        ? "- The previous answer included outside meaning. Return only the shortest core gloss for the selected word"
        : "- Return only the shortest core gloss for the selected word",
      "",
      "Examples:",
      "Selected word: earns",
      "Sentence: If he earns rank, he'll lead.",
      "Answer: earns",
      "",
      "Selected word: rank",
      "Sentence: If he earns rank, he'll lead.",
      "Answer: rank",
      "",
      `Selected word: ${text}`,
      `Sentence: ${sentenceContext}`,
      "Answer:",
    ].join("\n");
  }

  return [
    "请按当前句子语境翻译选中词，不要额外解释。",
    "要求：",
    "- 句子只用于判断词义",
    "- 只翻译选中词本身",
    "- 不要把相邻名词、宾语、补语翻进去",
    strict ? "- 上一次答案包含了选区外含义，这次只输出该词最短核心词义" : "- 只输出该词最短核心词义",
    "",
    "示例：",
    "选中词：earns",
    "所在句子：If he earns rank, he'll lead.",
    "答案：获得",
    "",
    "选中词：rank",
    "所在句子：If he earns rank, he'll lead.",
    "答案：军衔",
    "",
    `选中词：${text}`,
    `所在句子：${sentenceContext}`,
    "答案：",
  ].join("\n");
}

function buildHunyuanDirectTranslationPrompt(text: string, targetLanguage: string) {
  if (targetLanguage === "zh-CN") {
    return [
      "把下面的文本翻译成简体中文，不要额外解释。",
      "",
      text,
    ].join("\n");
  }

  return [
    `Translate the following segment into ${describeLanguage(targetLanguage)}, without additional explanation.`,
    "",
    text,
  ].join("\n");
}

export function buildStandaloneWordTranslationPrompt(
  text: string,
  targetLanguage: string,
  wordClass: SingleWordClassHint,
): SelectionTranslationPrompt {
  if (targetLanguage === "zh-CN") {
    if (wordClass === "noun") {
      return {
        mode: "word",
        prompt: ["把下面的英文名词翻译成简体中文，不要额外解释。", "", text].join("\n"),
      };
    }

    if (wordClass === "verb") {
      return {
        mode: "word",
        prompt: ["把下面的英文动词翻译成简体中文，不要额外解释。", "", text].join("\n"),
      };
    }
  }

  if (wordClass === "noun") {
    return {
      mode: "word",
      prompt: [`Translate the following English noun into ${describeLanguage(targetLanguage)}, without additional explanation.`, "", text].join("\n"),
    };
  }

  if (wordClass === "verb") {
    return {
      mode: "word",
      prompt: [`Translate the following English verb into ${describeLanguage(targetLanguage)}, without additional explanation.`, "", text].join("\n"),
    };
  }

  return {
    mode: "word",
    prompt:
      targetLanguage === "zh-CN"
        ? ["把下面的英文单词翻译成简体中文，不要额外解释。", "", text].join("\n")
        : [`Translate the following English word into ${describeLanguage(targetLanguage)}, without additional explanation.`, "", text].join("\n"),
  };
}

export function classifySelectionTranslationMode(text: string, sentenceContext?: string): SelectionTranslationMode {
  const normalizedText = normalizeText(text);
  const normalizedSentence = normalizeText(sentenceContext);

  if (!normalizedText) {
    return "sentence";
  }

  if (!normalizedSentence) {
    return "sentence";
  }

  if (normalizedText === normalizedSentence) {
    return "sentence";
  }

  if (looksLikeSingleWord(normalizedText)) {
    return "word";
  }

  return "phrase";
}

export function buildSelectionTranslationPrompt({
  sentenceContext,
  strict = false,
  targetLanguage,
  text,
  textModel,
}: BuildSelectionTranslationPromptOptions): SelectionTranslationPrompt {
  const mode = classifySelectionTranslationMode(text, sentenceContext);
  const profile = resolveTranslationPromptProfile(textModel);

  if (profile === "hunyuan_mt") {
    if (mode === "word" && sentenceContext) {
      return {
        mode,
        prompt: buildHunyuanWordPrompt(text, sentenceContext, targetLanguage, strict),
      };
    }

    return {
      mode: "sentence",
      prompt: buildHunyuanDirectTranslationPrompt(text, targetLanguage),
    };
  }

  if (mode === "word" && sentenceContext) {
    return {
      mode,
      prompt: buildWordGlossPrompt(text, sentenceContext, targetLanguage, strict),
    };
  }

  return {
    mode: "sentence",
    prompt: buildSentencePrompt(text, targetLanguage),
  };
}

export function cleanupSelectionTranslationOutput(output: string, mode: SelectionTranslationMode) {
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "";
  const strippedLine = firstLine
    .replace(/^(答案|译文|Answer|Translation)\s*[:：-]\s*/i, "")
    .replace(/^[-*]\s*/, "")
    .replace(/^[“”"‘’'`]+|[“”"‘’'`]+$/g, "")
    .replace(/[。.!?]+$/g, "")
    .trim();

  if (mode === "sentence") {
    return output.trim();
  }

  return strippedLine.split(/[，,;；]/, 1)[0]?.trim() ?? "";
}

export function shouldRetrySelectionGloss(output: string, mode: SelectionTranslationMode) {
  if (mode === "sentence") {
    return false;
  }

  if (/[，,;；]/.test(output)) {
    return true;
  }

  const cleaned = cleanupSelectionTranslationOutput(output, mode);
  if (!cleaned) {
    return true;
  }

  if (/[。！？.!?]/.test(cleaned)) {
    return true;
  }

  if (mode === "word" && cleaned.length > 2 && /[得为成到进出上下入升衔级]/u.test(cleaned.slice(-1))) {
    return true;
  }

  return cleaned.length > (mode === "word" ? 10 : 20);
}
