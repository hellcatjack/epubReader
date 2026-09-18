export function getEligibleIpaWord(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.includes(" ")) {
    return null;
  }

  if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(normalized)) {
    return null;
  }

  return normalized.toLowerCase();
}

type PhoneticsServiceDeps = { fetchImpl?: typeof fetch };

export function createPhoneticsService({ fetchImpl = fetch }: PhoneticsServiceDeps = {}) {
  const shards = new Map<string, Promise<Record<string, unknown>>>();
  return {
    async lookupIpa(word: string): Promise<string | null> {
      const normalized = getEligibleIpaWord(word);
      if (!normalized) return null;
      const letter = normalized[0];
      let shard = shards.get(letter);
      if (!shard) {
        shard = (async () => {
          const response = await fetchImpl(`/phonetics/en-US/v1/${letter}.json`);
          if (!response.ok) throw new Error("American IPA dictionary unavailable");
          const data: unknown = await response.json();
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("Invalid American IPA dictionary");
          }
          return data as Record<string, unknown>;
        })();
        shards.set(letter, shard);
        // A transient network failure must not suppress IPA for the whole session.
        void shard.catch(() => { shards.delete(letter); });
      }
      const entries = await shard;
      const value = Object.prototype.hasOwnProperty.call(entries, normalized) ? entries[normalized] : null;
      return typeof value === "string" && value.trim() ? value : null;
    },
  };
}

export const phoneticsService = createPhoneticsService();
