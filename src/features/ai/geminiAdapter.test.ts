import { expect, it, vi } from "vitest";
import { createGeminiAdapter } from "./geminiAdapter";

it("sends translation requests to gemini generateContent with the configured api key and model", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "安置" }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createGeminiAdapter({
    apiKey: "gemini-secret-key",
    fetch: fakeFetch,
    textModel: "gemini-2.5-flash",
  });

  await expect(
    adapter.translateSelection("stick", {
      sentenceContext: "Where else would you stick the oldest foster kid?",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("安置");

  expect(fakeFetch).toHaveBeenCalledWith(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    expect.objectContaining({
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "x-goog-api-key": "gemini-secret-key",
      }),
      method: "POST",
    }),
  );

  const body = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(body.contents[0]?.parts[0]?.text).toContain("选中词：stick");
  expect(body.generationConfig.temperature).toBe(0.1);
});

it("sends explain requests as Chinese grammar analysis only", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "<answer>\n## 先看整句\n这里是语法解析。\n</answer>" }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createGeminiAdapter({
    apiKey: "gemini-secret-key",
    fetch: fakeFetch,
    textModel: "gemini-2.5-flash",
  });

  await expect(adapter.explainSelection("Despite himself, Ender's voice trembled.", { targetLanguage: "zh-CN" })).resolves.toBe(
    "## 先看整句\n这里是语法解析。",
  );

  const body = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(body.contents[0]?.parts[0]?.text).toContain("## 先看整句");
  expect(body.contents[0]?.parts[0]?.text).toContain("## 再拆结构");
  expect(body.contents[0]?.parts[0]?.text).toContain("## 读起来要注意");
  expect(body.contents[0]?.parts[0]?.text).toContain("<answer>");
});

it("sends english definition requests through gemini generateContent with an english-only dictionary prompt", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "<answer>to be in a hurry; to feel short of time</answer>" }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const adapter = createGeminiAdapter({
    apiKey: "gemini-secret-key",
    fetch: fakeFetch,
    textModel: "gemini-2.5-flash",
  });

  await expect(
    adapter.defineSelection("pressed", {
      sentenceContext: "She looked pressed for time before the meeting.",
      targetLanguage: "zh-CN",
    }),
  ).resolves.toBe("to be in a hurry; to feel short of time");

  const body = JSON.parse(String(fakeFetch.mock.calls[0]?.[1]?.body));
  expect(body.contents[0]?.parts[0]?.text).toContain("concise English dictionary assistant");
  expect(body.contents[0]?.parts[0]?.text).toContain("Word: pressed");
  expect(body.contents[0]?.parts[0]?.text).toContain("Sentence: She looked pressed for time before the meeting.");
  expect(body.contents[0]?.parts[0]?.text).toContain("English only");
  expect(body.contents[0]?.parts[0]?.text).toContain("<answer>");
  expect(body.generationConfig.temperature).toBe(0.1);
});
