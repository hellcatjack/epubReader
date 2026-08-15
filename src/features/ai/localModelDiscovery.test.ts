import { afterEach, expect, it, vi } from "vitest";
import { listLocalModels, LocalModelDiscoveryAccessError } from "./localModelDiscovery";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("loads local model ids from the openai-compatible models endpoint", async () => {
  const fakeFetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [{ id: "local-reader-chat" }, { id: "phi-4-mini" }, { id: "phi-4-mini" }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );

  await expect(
    listLocalModels("https://ushome.amycat.com/openai/v1", {
      apiKey: " model-token ",
      fetch: fakeFetch,
    }),
  ).resolves.toEqual([
    "local-reader-chat",
    "phi-4-mini",
  ]);

  expect(fakeFetch).toHaveBeenCalledWith("https://ushome.amycat.com/openai/v1/models", {
    headers: {
      Authorization: "Bearer model-token",
    },
    method: "GET",
  });
});

it("omits authorization when model discovery token is blank", async () => {
  const fakeFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  await listLocalModels("https://example.test/v1", { apiKey: "  ", fetch: fakeFetch });

  expect(fakeFetch).toHaveBeenCalledWith("https://example.test/v1/models", {
    method: "GET",
  });
});

it("reports authenticated model discovery access failures without exposing response details", async () => {
  const fakeFetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: { message: "secret upstream detail" } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const result = listLocalModels("https://example.test/v1", {
    apiKey: "invalid-token",
    fetch: fakeFetch,
  });

  await expect(result).rejects.toBeInstanceOf(LocalModelDiscoveryAccessError);
  await expect(result).rejects.not.toThrow(/secret upstream detail|invalid-token/i);
});

it("blocks insecure private-network model discovery from secure pages before fetch", async () => {
  const fakeFetch = vi.fn();
  vi.stubGlobal("isSecureContext", true);

  await expect(
    listLocalModels("http://192.168.1.31:8001/v1/chat/completions", { fetch: fakeFetch }),
  ).rejects.toThrow(/cannot auto-discover models/i);

  expect(fakeFetch).not.toHaveBeenCalled();
});
