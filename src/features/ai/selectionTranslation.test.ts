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
    expect(prompt.prompt).toContain("只输出译文。");
    expect(prompt.prompt).toContain("不要解释。");
    expect(prompt.prompt).toContain("不要重复要求或标签。");
    expect(prompt.prompt).toContain("待翻译内容：");
    expect(prompt.prompt).toContain("looked up at him");
    expect(prompt.prompt).toContain("译文：");
    expect(prompt.prompt).not.toContain("所在句子：");
    expect(prompt.prompt).not.toContain("要求：");
  });

  it("uses the default contextual word prompt even for HY-MT1.5 single-word selections", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
      text: "stick",
      textModel: "HY-MT1.5-7B-GGUF",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
    expect(prompt.prompt).toContain("选中词：stick");
    expect(prompt.prompt).toContain("所在句子：Where else would you stick the oldest foster kid?");
  });

  it("uses the default direct translation prompt for HY-MT1.5 multi-word selections", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "He looked up at him before leaving the room.",
      targetLanguage: "zh-CN",
      text: "looked up at him",
      textModel: "HY-MT1.5-7B-GGUF",
    });

    expect(prompt.mode).toBe("sentence");
    expect(prompt.prompt).toContain("请将下面的内容准确翻译成简体中文");
    expect(prompt.prompt).toContain("不要重复要求或标签。");
    expect(prompt.prompt).toContain("待翻译内容：");
    expect(prompt.prompt).toContain("looked up at him");
    expect(prompt.prompt).toContain("译文：");
    expect(prompt.prompt).not.toContain("所在句子：");
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

  it("uses the default contextual word prompt for namespaced HY-MT1.5 model ids", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
      text: "stick",
      textModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
  });

  it("uses the default contextual word prompt for HY-MT1.5 1.8B model ids", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
      text: "stick",
      textModel: "tencent/HY-MT1.5-1.8B-GGUF:Q8_0",
    });

    expect(prompt.mode).toBe("word");
    expect(prompt.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
  });

  it("uses the default sentence translation prompt when HY-MT1.5 selection spans the whole sentence", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "If he earns rank, he'll lead.",
      targetLanguage: "zh-CN",
      text: "If he earns rank, he'll lead.",
      textModel: "HY-MT1.5-7B-GGUF",
    });

    expect(prompt.mode).toBe("sentence");
    expect(prompt.prompt).toContain("请将下面的内容准确翻译成简体中文");
    expect(prompt.prompt).toContain("不要重复要求或标签。");
    expect(prompt.prompt).toContain("If he earns rank, he'll lead.");
  });

  it("uses a short-source direct translation prompt that explicitly forbids echoing instruction labels", () => {
    const prompt = buildSelectionTranslationPrompt({
      sentenceContext: "OK, that’s true.",
      targetLanguage: "zh-CN",
      text: "OK, that’s true.",
    });

    expect(prompt.mode).toBe("sentence");
    expect(prompt.prompt).toContain("请将下面的内容准确翻译成简体中文");
    expect(prompt.prompt).toContain("不要重复要求或标签。");
    expect(prompt.prompt).toContain("待翻译内容：");
    expect(prompt.prompt).toContain("OK, that’s true.");
    expect(prompt.prompt).toContain("译文：");
    expect(prompt.prompt).not.toContain("要求：");
    expect(prompt.prompt).not.toContain("- 只输出译文");
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
    expect(prompt.prompt).toContain("待翻译内容：");
    expect(prompt.prompt).toContain("She looked pressed for time before the meeting.");
    expect(prompt.prompt).toContain("译文：");
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
