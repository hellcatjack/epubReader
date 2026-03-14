import { expect, it, vi } from "vitest";
import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";

it("sends translate and explain requests to the local chat completions endpoint without auth headers", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "hello" } }],
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
    "http://192.168.1.31:8001/v1/chat/completions",
    expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );

  const requestBody = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(requestBody.messages).toEqual([
    expect.objectContaining({
      role: "system",
    }),
    expect.objectContaining({
      role: "user",
      content: expect.stringContaining("hola"),
    }),
  ]);

  const explainRequestBody = JSON.parse(String(fakeFetch.mock.calls[1]?.[1]?.body));
  expect(explainRequestBody.messages[1]?.content).toContain("Explain the following reading selection in Simplified Chinese");

  const fallbackEnglishBody = JSON.parse(String(fakeFetch.mock.calls[2]?.[1]?.body));
  expect(fallbackEnglishBody.messages[0]?.content).toContain("Reply only in English");
  expect(fallbackEnglishBody.messages[1]?.content).toContain("Explain the following reading selection in English");
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
