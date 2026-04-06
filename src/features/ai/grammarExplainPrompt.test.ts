import { describe, expect, it } from "vitest";
import {
  createGrammarExplainSystemPrompt,
  createGrammarExplainUserPrompt,
  extractGrammarExplainAnswer,
} from "./grammarExplainPrompt";

describe("grammarExplainPrompt", () => {
  it("uses a natural teacher-style system prompt with a tagged final-answer contract", () => {
    const prompt = createGrammarExplainSystemPrompt();

    expect(prompt).toContain("阅读老师");
    expect(prompt).toContain("自然");
    expect(prompt).toContain("<answer>");
    expect(prompt).toContain("</answer>");
    expect(prompt).not.toContain("只输出中文语法解析");
  });

  it("uses the supplied sentence in a compact markdown explanation prompt", () => {
    const text = "“What are we supposed to do, then?” asked a boy, a really small black kid who had a top bunk near Ender’s.";
    const prompt = createGrammarExplainUserPrompt(text);

    expect(prompt).toContain("最终答案放在 <answer> 和 </answer> 之间");
    expect(prompt).toContain("## 先看整句");
    expect(prompt).toContain("## 再拆结构");
    expect(prompt).toContain("## 读起来要注意");
    expect(prompt).toContain("保持紧凑、自然，宁可少说一点，也不要铺开");
    expect(prompt).toContain("成对的 ASCII 反引号(`)");
    expect(prompt).toContain("不要使用单引号");
    expect(prompt).toContain(text);
  });

  it("extracts the final tagged grammar explanation from the model output", () => {
    expect(
      extractGrammarExplainAnswer("前置噪音\n<answer>\n## 先看整句\n这里是讲解。\n</answer>\n后置噪音"),
    ).toBe("## 先看整句\n这里是讲解。");
    expect(extractGrammarExplainAnswer("<answer>\n## 再拆结构")).toBe("## 再拆结构");
    expect(extractGrammarExplainAnswer("普通正文")).toBe("普通正文");
  });
});
