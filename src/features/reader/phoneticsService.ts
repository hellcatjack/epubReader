type DictionaryPhonetic = {
  text?: string;
};

type DictionaryEntry = {
  phonetic?: string;
  phonetics?: DictionaryPhonetic[];
};

function normalizeIpaCandidate(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

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

export function extractIpaFromEntries(entries: DictionaryEntry[] | null | undefined) {
  if (!entries?.length) {
    return null;
  }

  for (const entry of entries) {
    for (const phonetic of entry.phonetics ?? []) {
      const candidate = normalizeIpaCandidate(phonetic.text);
      if (candidate) {
        return candidate;
      }
    }

    const fallback = normalizeIpaCandidate(entry.phonetic);
    if (fallback) {
      return fallback;
    }
  }

  return null;
}

type PhoneticsServiceDeps = {
  fetchImpl?: typeof fetch;
};

export function createPhoneticsService({ fetchImpl = fetch }: PhoneticsServiceDeps = {}) {
  const cache = new Map<string, Promise<string | null>>();

  return {
    async lookupIpa(word: string) {
      const normalizedWord = getEligibleIpaWord(word);
      if (!normalizedWord) {
        return null;
      }

      const cached = cache.get(normalizedWord);
      if (cached) {
        return cached;
      }

      const pendingLookup = (async () => {
        try {
          const resolvedFetch = fetchImpl ?? globalThis.fetch;
          if (!resolvedFetch) {
            return null;
          }

          const response = await resolvedFetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`,
          );

          if (!response.ok) {
            return null;
          }

          const entries = (await response.json()) as DictionaryEntry[];
          return extractIpaFromEntries(entries);
        } catch {
          return null;
        }
      })();

      cache.set(normalizedWord, pendingLookup);
      return pendingLookup;
    },
  };
}

export const phoneticsService = createPhoneticsService();
