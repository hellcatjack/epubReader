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
          choices: [{ message: { content: "短暂存在的。" } }],
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
          choices: [{ message: { content: "It means short-lived." } }],
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
  expect(explanation).toContain("中文解释");
  expect(explanation).toContain("English explanation");

  expect(fakeFetch).toHaveBeenCalledTimes(3);
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
  expect(requestBody.prompt).toContain("Text: hola");
  expect(requestBody.prompt).toContain("Translation:");

  const explainRequestBody = JSON.parse(String(fakeFetch.mock.calls[1]?.[1]?.body));
  expect(explainRequestBody.messages[1]?.content).toContain("Explain the following reading selection in Simplified Chinese");

  const fallbackEnglishBody = JSON.parse(String(fakeFetch.mock.calls[2]?.[1]?.body));
  expect(fallbackEnglishBody.messages[0]?.content).toContain("Reply only in English");
  expect(fallbackEnglishBody.messages[1]?.content).toContain("Explain the following reading selection in English");
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
  expect(fakeFetch).toHaveBeenNthCalledWith(
    3,
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
  expect(requestBody.prompt).toContain("待翻译内容：looked up at him");
  expect(requestBody.prompt).not.toContain("所在句子：");
  expect(requestBody.stop).toBeUndefined();
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
  expect(requestBody.prompt).toContain("待翻译内容：She looked pressed for time before the meeting.");
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
  expect(requestBody.prompt).toContain("待翻译内容：She’d lie on her stomach");
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
