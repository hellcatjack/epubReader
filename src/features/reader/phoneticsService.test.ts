import { describe, expect, it, vi } from "vitest";
import { createPhoneticsService, getEligibleIpaWord } from "./phoneticsService";

describe("getEligibleIpaWord", () => {
  it("accepts a single english word and normalizes casing", () => {
    expect(getEligibleIpaWord("Pressed")).toBe("pressed");
  });

  it("accepts apostrophe and hyphen words", () => {
    expect(getEligibleIpaWord("Morgan's")).toBe("morgan's");
    expect(getEligibleIpaWord("snow-covered")).toBe("snow-covered");
  });

  it("rejects phrases and punctuation-only selections", () => {
    expect(getEligibleIpaWord("The thing")).toBeNull();
    expect(getEligibleIpaWord("...")).toBeNull();
    expect(getEligibleIpaWord("Chapter One")).toBeNull();
  });
});

describe("local American IPA", () => {
  it("shares a letter shard and preserves alternative pronunciations", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify({babylon: "/ˈbæbəˌɫɑn/", baby: "/ˈbeɪbi/, /alternative/"})));
    const service = createPhoneticsService({fetchImpl});
    expect(await Promise.all([service.lookupIpa("Babylon"), service.lookupIpa("baby")])).toEqual(["/ˈbæbəˌɫɑn/", "/ˈbeɪbi/, /alternative/"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("/phonetics/en-US/v1/b.json");
    expect(await service.lookupIpa("bunknown")).toBeNull();
  });
  it("retries unavailable shards instead of caching failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(new Response(JSON.stringify({read: "/ˈɹɛd/, /ˈɹid/"})));
    const service = createPhoneticsService({fetchImpl});
    await expect(service.lookupIpa("read")).rejects.toThrow();
    await expect(service.lookupIpa("read")).resolves.toBe("/ˈɹɛd/, /ˈɹid/");
  });
  it("does not mistake inherited properties for entries", async () => {
    const service = createPhoneticsService({fetchImpl: async () => new Response("{}")});
    expect(await service.lookupIpa("constructor")).toBeNull();
  });
  it("rejects an HTML fallback or failed HTTP response", async () => {
    for (const response of [new Response("<html>fallback</html>"), new Response("{}", {status:503})]) {
      const service = createPhoneticsService({fetchImpl: async () => response});
      await expect(service.lookupIpa("hello")).rejects.toThrow();
    }
  });
});
