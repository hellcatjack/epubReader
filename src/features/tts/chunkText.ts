function splitIntoSentences(paragraph: string) {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitOversizedSentence(sentence: string, maxCharacters: number) {
  const words = sentence.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    current = word;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function chunkText(text: string, maxCharacters = 280) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= maxCharacters) {
      return [paragraph];
    }

    return splitIntoSentences(paragraph).flatMap((sentence) => {
      if (sentence.length <= maxCharacters) {
        return [sentence];
      }

      return splitOversizedSentence(sentence, maxCharacters);
    });
  });
}
