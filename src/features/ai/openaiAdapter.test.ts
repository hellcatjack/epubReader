import { expect, it, vi } from "vitest";
import { createOpenAIAdapter, normalizeOpenAIError } from "./openaiAdapter";

it("normalizes translation, explanation, speech, aborts, and provider errors through one OpenAI contract", async () => {
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "hello" }],
            },
          ],
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
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "transient means short-lived" }],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response("speech", {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "hello again" }],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  const abortController = new AbortController();
  const adapter = createOpenAIAdapter({ apiKey: "test-key", fetch: fakeFetch });

  await expect(adapter.translateSelection("hola", { targetLanguage: "en" })).resolves.toBe("hello");
  await expect(adapter.explainSelection("ephemeral", { targetLanguage: "zh-CN" })).resolves.toBe(
    "transient means short-lived",
  );
  await expect(
    adapter.synthesizeSpeech("hello world", { voice: "alloy" }).then((blob) => ({
      size: blob.size,
      type: blob.type,
    })),
  ).resolves.toEqual({
    size: 6,
    type: "audio/mpeg",
  });
  await expect(
    adapter.translateSelection("hola", { targetLanguage: "en", signal: abortController.signal }),
  ).resolves.toBe("hello again");

  expect(fakeFetch).toHaveBeenCalledTimes(4);
  expect(fakeFetch).toHaveBeenNthCalledWith(
    1,
    "https://api.openai.com/v1/responses",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      }),
    }),
  );
  expect(fakeFetch).toHaveBeenNthCalledWith(
    3,
    "https://api.openai.com/v1/audio/speech",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      }),
    }),
  );
  expect(fakeFetch.mock.calls[3]?.[1]?.signal).toBe(abortController.signal);
  expect(normalizeOpenAIError(new Response(null, { status: 401 }))).toEqual({ kind: "auth" });
  expect(normalizeOpenAIError(new TypeError("Failed to fetch"))).toEqual({ kind: "network-or-cors" });
});
