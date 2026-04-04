import { resolveLlmApiEndpoints } from "./aiEndpoints";

type FetchLike = typeof fetch;

export class LocalModelDiscoveryBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalModelDiscoveryBlockedError";
  }
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

function blocksInsecureHttpModelDiscovery(modelsEndpoint: string) {
  if (typeof globalThis === "undefined" || !globalThis.isSecureContext) {
    return false;
  }

  try {
    const url = new URL(modelsEndpoint, globalThis.location?.href);
    return url.protocol === "http:" && !isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function extractModelIds(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const data = Reflect.get(payload, "data");
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => (item && typeof item === "object" ? Reflect.get(item, "id") : ""))
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

export async function listLocalModels(endpoint: string, fetchFn: FetchLike = fetch) {
  const { modelsEndpoint } = resolveLlmApiEndpoints(endpoint);
  if (blocksInsecureHttpModelDiscovery(modelsEndpoint)) {
    throw new LocalModelDiscoveryBlockedError(
      "Secure pages cannot auto-discover models from http private-network endpoints. Use HTTPS, localhost, or type the model id manually.",
    );
  }

  const response = await fetchFn(modelsEndpoint, {
    method: "GET",
  });

  if (!response.ok) {
    throw response;
  }

  const payload = await response.json();
  return [...new Set(extractModelIds(payload))];
}
