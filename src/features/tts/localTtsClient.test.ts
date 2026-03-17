import { describe, expect, it, vi } from "vitest";
import { createLocalTtsClient, resolveDefaultTtsHelperUrl } from "./localTtsClient";

describe("localTtsClient", () => {
  it("requests helper health, voices, and speech from the local helper", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            version: "0.1.0",
            backend: "kokoro",
            voiceCount: 1,
            warmed: true,
            device: "cuda:0",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "Ryan",
              displayName: "Ryan",
              locale: "en-US",
              gender: "male",
              isDefault: true,
            },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("wav", {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    expect(resolveDefaultTtsHelperUrl("192.168.1.31")).toBe("http://192.168.1.31:43115");

    const client = createLocalTtsClient({
      baseUrl: resolveDefaultTtsHelperUrl("192.168.1.31"),
      fetch: fetchMock,
    });

    await expect(client.getHealth()).resolves.toMatchObject({
      status: "ok",
      voiceCount: 1,
      warmed: true,
      device: "cuda:0",
      backend: "kokoro",
    });
    await expect(client.getVoices()).resolves.toEqual([
      expect.objectContaining({
        id: "Ryan",
        displayName: "Ryan",
      }),
    ]);
    await expect(
      client.speak({
        format: "wav",
        rate: 1,
        text: "Hello world",
        voiceId: "Ryan",
        volume: 1,
      }),
    ).resolves.toMatchObject({
      size: 3,
      type: "audio/wav",
    });
    await expect(client.prewarm()).resolves.toEqual({
      status: "ok",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://192.168.1.31:43115/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://192.168.1.31:43115/voices",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://192.168.1.31:43115/speak",
      expect.objectContaining({
        body: JSON.stringify({
          format: "wav",
          rate: 1,
          text: "Hello world",
          voiceId: "Ryan",
          volume: 1,
        }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://192.168.1.31:43115/prewarm",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
