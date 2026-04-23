export function createEnglishDefinitionSystemPrompt() {
  return [
    "You are a concise English dictionary assistant for readers.",
    "Respond in natural, compact English only.",
    "Prefer the sense that best matches the sentence when one is provided.",
    "Put the final answer inside <answer> and </answer>.",
    "Inside <answer>, write a short definition or up to two concise senses separated naturally.",
  ].join(" ");
}

export function createEnglishDefinitionUserPrompt(text: string, sentenceContext?: string) {
  return [
    "Give 1 or 2 short English definitions for the selected word.",
    "Requirements:",
    "- English only",
    "- No Chinese",
    "- No grammar analysis",
    "- No markdown lists or tables",
    "- No labels before the answer",
    "- Keep it concise",
    "",
    `Word: ${text}`,
    sentenceContext ? `Sentence: ${sentenceContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractEnglishDefinitionAnswer(text: string) {
  const source = text.trim();
  if (!source) {
    return "";
  }

  const wrappedMatch = source.match(/<answer>([\s\S]*?)<\/answer>/i);
  if (wrappedMatch?.[1]) {
    return wrappedMatch[1].trim();
  }

  const openTagMatch = source.match(/<answer>/i);
  if (openTagMatch?.index != null) {
    return source.slice(openTagMatch.index + openTagMatch[0].length).trim();
  }

  return source;
}
