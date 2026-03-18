import { describe, expect, it, vi } from "vitest";
import { createPhoneticsService, extractIpaFromEntries, getEligibleIpaWord } from "./phoneticsService";

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

describe("extractIpaFromEntries", () => {
  it("prefers phonetics text before the legacy phonetic field", () => {
    expect(
      extractIpaFromEntries([
        {
          phonetic: "/legacy/",
          phonetics: [{ text: "" }, { text: "/prest/" }],
        },
      ]),
    ).toBe("/prest/");
  });

  it("falls back to the top-level phonetic field", () => {
    expect(extractIpaFromEntries([{ phonetic: "/fallback/" }])).toBe("/fallback/");
  });

  it("returns null when no usable ipa is available", () => {
    expect(extractIpaFromEntries([{ phonetics: [{ text: "" }] }])).toBeNull();
  });
});

describe("createPhoneticsService", () => {
  it("caches normalized word lookups for the current session", async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => [{ phonetics: [{ text: "/prest/" }] }],
      ok: true,
    })) as unknown as typeof fetch;

    const service = createPhoneticsService({ fetchImpl });

    await expect(service.lookupIpa("Pressed")).resolves.toBe("/prest/");
    await expect(service.lookupIpa("pressed")).resolves.toBe("/prest/");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null when the dictionary request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const service = createPhoneticsService({ fetchImpl });

    await expect(service.lookupIpa("pressed")).resolves.toBeNull();
  });
});
