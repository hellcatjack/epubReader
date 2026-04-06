export function createGrammarExplainSystemPrompt() {
  return [
    "你是给中文读者讲英语句法的阅读老师。",
    "请用自然、顺口、像带读一样的中文解释句子。",
    "可以引用少量英文短语帮助定位，但不要整段翻译。",
    "最终给用户看的答案完整放在 <answer> 和 </answer> 之间。",
    "<answer> 里使用干净的 Markdown，不要代码块。",
  ].join("");
}

export function createGrammarExplainUserPrompt(text: string) {
  return [
    "请带着读者顺一遍这句话，不要写成术语堆砌。",
    "最终答案放在 <answer> 和 </answer> 之间，并按下面的形式组织：",
    "",
    "## 先看整句",
    "用两三句话说清这句话在发生什么、语气怎样。",
    "",
    "## 再拆结构",
    "用 2 到 4 个 markdown 列表项，顺着语序讲主干、补充说明和修饰关系。",
    "",
    "## 读起来要注意",
    "用 2 到 3 个 markdown 列表项，点出固定搭配和容易误解的地方。",
    "",
    "保持紧凑、自然，宁可少说一点，也不要铺开。",
    "如果要引用英文短语，只能使用成对的 ASCII 反引号(`)包裹完整短语。",
    "不要使用单引号 '、弯引号 ‘ ’ 或半边反引号。",
    "不要写代码块、表格，也不要在 <answer> 外补充正文。",
    "",
    "句子：",
    text,
  ].join("\n");
}

export function extractGrammarExplainAnswer(text: string) {
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
