import { resolveLlmApiEndpoints } from "./aiEndpoints";

type FetchLike = typeof fetch;

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
  const response = await fetchFn(modelsEndpoint, {
    method: "GET",
  });

  if (!response.ok) {
    throw response;
  }

  const payload = await response.json();
  return [...new Set(extractModelIds(payload))];
}
