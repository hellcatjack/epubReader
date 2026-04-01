import { describe, expect, it } from "vitest";
import {
  buildStandaloneWordTranslationPrompt,
  buildSelectionTranslationPrompt,
  cleanupSelectionTranslationOutput,
  classifySelectionTranslationMode,
  inferLikelySingleWordClass,
  shouldRetrySelectionGloss,
} from "./selectionTranslation";

describe("selectionTranslation", () => {
  it("classifies a single-token selection as a word when sentence context exists", () => {
    expect(
      classifySelectionTranslationMode("pressed", "She looked pressed for time before the meeting."),
    ).toBe("word");
  });

  it("classifies a multi-word selection as a phrase when it is smaller than the sentence", () => {
    expect(
      classifySelectionTranslationMode("looked up at him", "He looked up at him before leaving the room."),
    ).toBe("phrase");
  });

  it("classifies a selection as a sentence when it matches the sentence context", () => {
    expect(
      classifySelectionTranslationMode(
        "She looked pressed for time before the meeting.",
        "She looked pressed for time before the meeting.",
      ),
    ).toBe("sentence");
  });

  it("falls back to sentence mode when sentence context is unavailable", () => {
    expect(classifySelectionTranslationMode("pressed", undefined)).toBe("sentence");
  });

  it("builds a contextual word-gloss prompt", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "She looked pressed for time before the meeting.",
      targetLanguage: "zh-CN",
      text: "pressed",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
    expect(prompt.prompt).toContain("答案：时间紧迫");
    expect(prompt.prompt).toContain("答案：压平");
    expect(prompt.prompt).toContain("选中词：pressed");
    expect(prompt.prompt).toContain("所在句子：She looked pressed for time before the meeting.");
  });

  it("builds a direct translation prompt for multi-word selections instead of using sentence context", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "He looked up at him before leaving the room.",
      targetLanguage: "zh-CN",
      text: "looked up at him",
    });

    expect(prompt.mode).toBe("sentence");
    expect(prompt.prompt).toContain("请将下面的内容准确翻译成简体中文");
    expect(prompt.prompt).toContain("待翻译内容：looked up at him");
    expect(prompt.prompt).not.toContain("所在句子：");
  });

  it("uses the narrowed Hunyuan word prompt for single-word disambiguation", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
      text: "stick",
      textModel: "HY-MT1.5-7B-GGUF",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("请按当前句子语境翻译选中词，不要额外解释。");
    expect(prompt.prompt).toContain("选中词：stick");
    expect(prompt.prompt).toContain("所在句子：Where else would you stick the oldest foster kid?");
  });

  it("uses a direct segment translation prompt for multi-word Hunyuan selections", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "He looked up at him before leaving the room.",
      targetLanguage: "zh-CN",
      text: "looked up at him",
      textModel: "HY-MT1.5-7B-GGUF",
    });

    expect(prompt.mode).toBe("sentence");
    expect(prompt.prompt).toContain("把下面的文本翻译成简体中文，不要额外解释。");
    expect(prompt.prompt).toContain("looked up at him");
    expect(prompt.prompt).not.toContain("句子：");
  });

  it("keeps the existing default prompt for non-Hunyuan local models", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
      text: "stick",
      textModel: "local-reader-chat",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
  });

  it("matches the Hunyuan profile for namespaced quantized model ids", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
      text: "stick",
      textModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("请按当前句子语境翻译选中词，不要额外解释。");
  });

  it("adds stronger word-boundary instructions to the Hunyuan single-word prompt", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "If he earns rank, he'll lead.",
      targetLanguage: "zh-CN",
      text: "earns",
      textModel: "HY-MT1.5-7B-GGUF",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("句子只用于判断词义");
    expect(prompt.prompt).toContain("不要把相邻名词、宾语、补语翻进去");
    expect(prompt.prompt).toContain("只输出该词最短核心词义");
  });

  it("includes earns/rank boundary examples in the Hunyuan single-word prompt", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "If he earns rank, he'll lead.",
      targetLanguage: "zh-CN",
      text: "earns",
      textModel: "HY-MT1.5-7B-GGUF",
    });

    expect(prompt.prompt).toContain("选中词：earns");
    expect(prompt.prompt).toContain("所在句子：If he earns rank, he'll lead.");
    expect(prompt.prompt).toContain("答案：获得");
    expect(prompt.prompt).toContain("选中词：rank");
    expect(prompt.prompt).toContain("答案：军衔");
  });

  it("infers a likely verb/noun split for the earns/rank boundary sentence", () => {
    expect(inferLikelySingleWordClass("earns", "If he earns rank, he'll lead.")).toBe("verb");
    expect(inferLikelySingleWordClass("rank", "If he earns rank, he'll lead.")).toBe("noun");
  });

  it("builds a standalone noun fallback prompt for single-word mistranslations", () => {
    const prompt = buildStandaloneWordTranslationPrompt("rank", "zh-CN", "noun");

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("把下面的英文名词翻译成简体中文");
    expect(prompt.prompt).toContain("rank");
  });

  it("builds a sentence translation prompt when the selection is the whole sentence", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "She looked pressed for time before the meeting.",
      targetLanguage: "zh-CN",
      text: "She looked pressed for time before the meeting.",
    });

    expect(prompt.mode).toBe("sentence");
    expect(prompt.prompt).toContain("请将下面的内容准确翻译成简体中文");
    expect(prompt.prompt).toContain("待翻译内容：She looked pressed for time before the meeting.");
  });

  it("cleans gloss output down to the first plain line", () => {
    expect(cleanupSelectionTranslationOutput("“时间紧迫的”\nShe looked busy.", "word")).toBe("时间紧迫的");
    expect(cleanupSelectionTranslationOutput("答案：抬头看着他。", "phrase")).toBe("抬头看着他");
  });

  it("trims gloss output back to the selected fragment when the model spills past a comma", () => {
    expect(cleanupSelectionTranslationOutput("答案：她会趴着，踢着脚，然后消失。", "phrase")).toBe("她会趴着");
  });

  it("flags sentence-like gloss output for one stricter retry", () => {
    expect(shouldRetrySelectionGloss("He looked up at him before leaving the room.", "phrase")).toBe(true);
    expect(shouldRetrySelectionGloss("她会趴着，踢着脚", "phrase")).toBe(true);
    expect(shouldRetrySelectionGloss("时间紧迫的", "word")).toBe(false);
  });
});
