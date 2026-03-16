type FetchLike = typeof fetch;

export type LocalTtsHealth = {
  backend: string;
  status: string;
  version: string;
  voiceCount: number;
};

export type LocalTtsVoice = {
  displayName: string;
  gender: string;
  id: string;
  isDefault: boolean;
  locale: string;
};

export type LocalTtsSpeakRequest = {
  format: "wav";
  rate: number;
  text: string;
  voiceId: string;
  volume: number;
};

type LocalTtsClientDeps = {
  baseUrl?: string;
  fetch?: FetchLike;
};

const DEFAULT_TTS_HELPER_HOST = "127.0.0.1";
const DEFAULT_TTS_HELPER_PORT = 43115;

export function resolveDefaultTtsHelperUrl(hostname?: string) {
  const trimmedHostname = hostname?.trim();
  const resolvedHostname = trimmedHostname || globalThis.location?.hostname || DEFAULT_TTS_HELPER_HOST;

  return `http://${resolvedHostname}:${DEFAULT_TTS_HELPER_PORT}`;
}

async function assertOk(response: Response) {
  if (response.ok) {
    return response;
  }

  throw response;
}

export function createLocalTtsClient({
  baseUrl = resolveDefaultTtsHelperUrl(),
  fetch: fetchFn = fetch,
}: LocalTtsClientDeps = {}) {
  return {
    async getHealth() {
      const response = await fetchFn(`${baseUrl}/health`, {
        method: "GET",
      });
      await assertOk(response);
      return (await response.json()) as LocalTtsHealth;
    },
    async getVoices() {
      const response = await fetchFn(`${baseUrl}/voices`, {
        method: "GET",
      });
      await assertOk(response);
      return (await response.json()) as LocalTtsVoice[];
    },
    async speak(request: LocalTtsSpeakRequest) {
      const response = await fetchFn(`${baseUrl}/speak`, {
        body: JSON.stringify(request),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      await assertOk(response);
      return response.blob();
    },
  };
}

export const localTtsClient = createLocalTtsClient();
