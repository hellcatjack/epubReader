import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLocalLlmModels } from "./useLocalLlmModels";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("debounces authenticated model discovery when the token changes", async () => {
  vi.useFakeTimers();
  const fakeFetch = vi
    .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "reader-model" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fakeFetch);

  const { rerender, result } = renderHook(
    ({ apiKey }) => useLocalLlmModels("https://example.test/v1", { apiKey }),
    { initialProps: { apiKey: "first-token" } },
  );

  expect(fakeFetch).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(fakeFetch).toHaveBeenCalledTimes(1);
  expect(result.current).toMatchObject({ models: ["reader-model"], status: "ready" });

  rerender({ apiKey: "second-token" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(399);
  });
  expect(fakeFetch).toHaveBeenCalledTimes(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(fakeFetch).toHaveBeenCalledTimes(2);
  expect(fakeFetch.mock.calls[1]?.[1]?.headers).toEqual({
    Authorization: "Bearer second-token",
  });
});

it("reports token or endpoint access failures without revealing the token", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));

  const { result } = renderHook(() =>
    useLocalLlmModels("https://example.test/v1", { apiKey: "private-reader-token" }),
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });

  expect(result.current.status).toBe("error");
  expect(result.current.message).toMatch(/token|access|endpoint/i);
  expect(result.current.message).not.toContain("private-reader-token");
});
