import { expect, it, vi } from "vitest";
import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";

it("sends translate requests to local completions and explain requests to local chat completions", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ text: "hello" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "<answer>\n## 先看整句\n这里是语法解析。\n</answer>" } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({ fetch: fakeFetch });

  await expect(adapter.translateSelection("hola", { targetLanguage: "en" })).resolves.toBe("hello");
  const explanation = await adapter.explainSelection("ephemeral", { targetLanguage: "zh-CN" });
  expect(explanation).toBe("## 先看整句\n这里是语法解析。");

  expect(fakeFetch).toHaveBeenCalledTimes(2);
  expect(fakeFetch).toHaveBeenNthCalledWith(
    1,
    "http://localhost:8001/v1/completions",
    expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("Translate the following text into English");
  expect(requestBody.prompt).toContain("Return translation only.");
  expect(requestBody.prompt).toContain("Do not explain.");
  expect(requestBody.prompt).toContain("Do not repeat the instructions or labels.");
  expect(requestBody.prompt).toContain("Text:");
  expect(requestBody.prompt).toContain("hola");
  expect(requestBody.prompt).toContain("Translation:");

  const explainRequestBody = JSON.parse(String(fakeFetch.mock.calls[1]?.[1]?.body));
  expect(explainRequestBody.messages[0]?.content).toContain("阅读老师");
  expect(explainRequestBody.messages[0]?.content).toContain("<answer>");
  expect(explainRequestBody.messages[1]?.content).toContain("## 先看整句");
  expect(explainRequestBody.messages[1]?.content).toContain("## 再拆结构");
  expect(explainRequestBody.messages[1]?.content).toContain("## 读起来要注意");
  expect(explainRequestBody.messages[1]?.content).toContain("最终答案放在 <answer> 和 </answer> 之间");
  expect(explainRequestBody.chat_template_kwargs).toEqual({ enable_thinking: false });
  expect(explainRequestBody.max_tokens).toBe(1400);
  expect(explainRequestBody.temperature).toBe(0.2);
  expect(explainRequestBody.reasoning_effort).toBeUndefined();
  expect(explainRequestBody.reasoning).toBeUndefined();
});

it("sends english definition requests to local chat completions through the explain-model path", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "<answer>to be in a hurry; to feel short of time</answer>" } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({ fetch: fakeFetch });

  await expect(
    adapter.defineSelection("pressed", {
      sentenceContext: "She looked pressed for time before the meeting.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("to be in a hurry; to feel short of time");

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.messages[0]?.content).toContain("concise English dictionary assistant");
  expect(requestBody.messages[0]?.content).toContain("<answer>");
  expect(requestBody.messages[1]?.content).toContain("Word: pressed");
  expect(requestBody.messages[1]?.content).toContain("Sentence: She looked pressed for time before the meeting.");
  expect(requestBody.messages[1]?.content).toContain("English only");
  expect(requestBody.chat_template_kwargs).toEqual({ enable_thinking: false });
  expect(requestBody.max_tokens).toBe(160);
  expect(requestBody.temperature).toBe(0.2);
});

it("normalizes a base llm api url into completions and chat-completions endpoints", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ text: "你好" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "中文解释" } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "English explanation" } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({
    endpoint: "http://localhost:1234/v1",
    fetch: fakeFetch,
  });

  await adapter.translateSelection("hello", { targetLanguage: "zh-CN" });
  await adapter.explainSelection("hello", { targetLanguage: "zh-CN" });

  expect(fakeFetch).toHaveBeenNthCalledWith(
    1,
    "http://localhost:1234/v1/completions",
    expect.anything(),
  );
  expect(fakeFetch).toHaveBeenNthCalledWith(
    2,
    "http://localhost:1234/v1/chat/completions",
    expect.anything(),
  );
});

it("uses a sentence-slot replacement prompt for contextual single-word translation", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "安置" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({ fetch: fakeFetch });

  await expect(
    adapter.translateSelection("stick", {
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("安置");

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
  expect(requestBody.prompt).toContain("选中词：stick");
  expect(requestBody.prompt).toContain("所在句子：Where else would you stick the oldest foster kid?");
  expect(requestBody.stop).toEqual(["，", ",", "\n"]);
});

it("routes HY-MT1.5 single-word selections through the shared completions path", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "然而" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "HY-MT1.5-7B-GGUF",
  });

  await expect(
    adapter.translateSelection("With", {
      sentenceContext: "With Ender, though, there was no such thing as not taking sides.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("然而");

  expect(fakeFetch).toHaveBeenNthCalledWith(1, "http://localhost:8001/v1/completions", expect.anything());
  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
  expect(requestBody.prompt).toContain("选中词：With");
  expect(requestBody.temperature).toBe(0.1);
  expect(requestBody.top_p).toBeUndefined();
});

it("keeps the default translation parameters for non-Hunyuan local models", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "安置" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "local-reader-chat",
  });

  await expect(
    adapter.translateSelection("stick", {
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("安置");

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.temperature).toBe(0.1);
  expect(requestBody.top_p).toBeUndefined();
  expect(requestBody.top_k).toBeUndefined();
  expect(requestBody.repetition_penalty).toBeUndefined();
});

it("matches the shared completions path for namespaced HY-MT1.5 model ids", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "Where else could you put him?" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
  });

  await adapter.translateSelection("stick", {
    sentenceContext: "Where else would you stick the oldest foster kid?",
    targetLanguage: "en",
  });

  expect(fakeFetch).toHaveBeenNthCalledWith(1, "http://localhost:8001/v1/completions", expect.anything());
  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("replace the selected word with the best short English fragment");
  expect(requestBody.prompt).toContain("Selected word: stick");
});

it("matches the shared completions path for HY-MT1.5 1.8B model ids", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "然而" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({
    fetch: fakeFetch,
    textModel: "tencent/HY-MT1.5-1.8B-GGUF:Q8_0",
  });

  await adapter.translateSelection("With", {
    sentenceContext: "With Ender, though, there was no such thing as not taking sides.",
    targetLanguage: "zh-CN",
  });

  expect(fakeFetch).toHaveBeenNthCalledWith(1, "http://localhost:8001/v1/completions", expect.anything());
  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("把原句里的“选中词”替换成最合适的中文片段");
});

it("does not apply a HY-MT1.5-specific retry path for mixed-script sentence output", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "埃nder的声音在颤抖。" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({
    endpoint: "https://ushome.amycat.com:18026/v1/chat/completions",
    fetch: fakeFetch,
    textModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
  });

  await expect(
    adapter.translateSelection("Ender’s voice trembled.", {
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("埃nder的声音在颤抖。");

  expect(fakeFetch).toHaveBeenCalledTimes(1);

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.temperature).toBe(0.2);
  expect(requestBody.top_p).toBeUndefined();
  expect(requestBody.prompt).toContain("请将下面的内容准确翻译成简体中文");
  expect(requestBody.prompt).toContain("不要重复要求或标签。");
  expect(requestBody.prompt).not.toContain("要求：");
  expect(requestBody.prompt).toContain("译文：");
});

it("translates multi-word selections directly without sentence-context glossing", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "抬头看着他" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({ fetch: fakeFetch });

  await expect(
    adapter.translateSelection("looked up at him", {
      sentenceContext: "He looked up at him before leaving the room.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("抬头看着他");

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("请将下面的内容准确翻译成简体中文");
  expect(requestBody.prompt).toContain("只输出译文。");
  expect(requestBody.prompt).toContain("不要解释。");
  expect(requestBody.prompt).toContain("不要重复要求或标签。");
  expect(requestBody.prompt).toContain("待翻译内容：");
  expect(requestBody.prompt).toContain("looked up at him");
  expect(requestBody.prompt).toContain("译文：");
  expect(requestBody.prompt).not.toContain("所在句子：");
  expect(requestBody.stop).toBeUndefined();
});

it("uses the shared completions path for HY-MT1.5 sentence translation requests", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "然而，对安德来说，根本不存在不站队这种事。" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({
    endpoint: "https://ushome.amycat.com:18026/v1/chat/completions",
    fetch: fakeFetch,
    textModel: "tencent/HY-MT1.5-7B-GGUF:Q4_K_M",
  });

  await expect(
    adapter.translateSelection("With Ender, though, there was no such thing as not taking sides.", {
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("然而，对安德来说，根本不存在不站队这种事。");

  expect(fakeFetch).toHaveBeenCalledTimes(1);
  expect(fakeFetch).toHaveBeenNthCalledWith(
    1,
    "https://ushome.amycat.com:18026/v1/completions",
    expect.anything(),
  );

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("请将下面的内容准确翻译成简体中文");
  expect(requestBody.prompt).toContain("不要重复要求或标签。");
  expect(requestBody.temperature).toBe(0.2);
});

it("uses a sentence translation prompt when the selection is the whole sentence", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "她在会前显得时间很紧。" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({ fetch: fakeFetch });

  await expect(
    adapter.translateSelection("She looked pressed for time before the meeting.", {
      sentenceContext: "She looked pressed for time before the meeting.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("她在会前显得时间很紧。");

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("请将下面的内容准确翻译成简体中文");
  expect(requestBody.prompt).toContain("待翻译内容：");
  expect(requestBody.prompt).toContain("She looked pressed for time before the meeting.");
  expect(requestBody.prompt).toContain("译文：");
});

it("does not retry multi-word selections with stricter gloss prompts", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ text: "她会趴着，踢着脚，然后出神" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createOpenAIAdapter({ fetch: fakeFetch });

  await expect(
    adapter.translateSelection("She’d lie on her stomach", {
      sentenceContext: "She’d lie on her stomach, kick her feet in the air, and get lost.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("她会趴着，踢着脚，然后出神");

  expect(fakeFetch).toHaveBeenCalledTimes(1);
  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.prompt).toContain("请将下面的内容准确翻译成简体中文");
  expect(requestBody.prompt).toContain("不要重复要求或标签。");
  expect(requestBody.prompt).toContain("待翻译内容：");
  expect(requestBody.prompt).toContain("She’d lie on her stomach");
  expect(requestBody.prompt).toContain("译文：");
  expect(requestBody.stop).toBeUndefined();
});

it("reports local network errors and marks speech synthesis as unsupported for now", async () => {
  const adapter = createOpenAIAdapter({
    fetch: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  });

  await expect(adapter.translateSelection("hola", { targetLanguage: "en" })).rejects.toEqual({
    kind: "network-or-cors",
  });
  await expect(adapter.synthesizeSpeech("hello world", { voice: "alloy" })).rejects.toEqual({
    kind: "unsupported",
  });
  expect(normalizeOpenAIError(new Error("unsupported"))).toEqual({ kind: "unsupported" });
});
