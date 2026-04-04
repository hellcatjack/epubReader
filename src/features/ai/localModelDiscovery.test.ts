import { expect, it, vi } from "vitest";
import { listLocalModels } from "./localModelDiscovery";

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

  await expect(listLocalModels("http://localhost:1234/v1/chat/completions", fakeFetch)).resolves.toEqual([
    "local-reader-chat",
    "phi-4-mini",
  ]);

  expect(fakeFetch).toHaveBeenCalledWith("http://localhost:1234/v1/models", {
    method: "GET",
  });
});

it("blocks insecure private-network model discovery from secure pages before fetch", async () => {
  const fakeFetch = vi.fn();
  vi.stubGlobal("isSecureContext", true);

  await expect(listLocalModels("http://192.168.1.31:8001/v1/chat/completions", fakeFetch)).rejects.toThrow(
    /cannot auto-discover models/i,
  );

  expect(fakeFetch).not.toHaveBeenCalled();
});
