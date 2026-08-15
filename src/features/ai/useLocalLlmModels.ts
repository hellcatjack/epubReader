import { useEffect, useState } from "react";
import {
  listLocalModels,
  LocalModelDiscoveryAccessError,
  LocalModelDiscoveryBlockedError,
} from "./localModelDiscovery";

type LocalModelState = {
  message: string;
  models: string[];
  status: "idle" | "loading" | "ready" | "error" | "blocked";
};

type UseLocalLlmModelsOptions = {
  apiKey?: string;
  enabled?: boolean;
};

export function useLocalLlmModels(endpoint: string, options: UseLocalLlmModelsOptions = {}) {
  const { apiKey = "", enabled = true } = options;
  const [state, setState] = useState<LocalModelState>({
    message: "",
    models: [],
    status: enabled ? "loading" : "idle",
  });

  useEffect(() => {
    if (!enabled) {
      setState({ message: "", models: [], status: "idle" });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState((current) => ({
      message: "",
      models: current.models,
      status: "loading",
    }));

    const timer = window.setTimeout(() => {
      void listLocalModels(endpoint, { apiKey, signal: controller.signal })
        .then((models) => {
          if (cancelled) {
            return;
          }

          setState({
            message: `Connection verified. ${models.length} model(s) available.`,
            models,
            status: "ready",
          });
        })
        .catch((error) => {
          if (cancelled || (error instanceof Error && error.name === "AbortError")) {
            return;
          }

          if (error instanceof LocalModelDiscoveryBlockedError) {
            setState({ message: error.message, models: [], status: "blocked" });
            return;
          }

          setState({
            message:
              error instanceof LocalModelDiscoveryAccessError
                ? error.message
                : "Could not load models from the current endpoint. You can still type the model id manually.",
            models: [],
            status: "error",
          });
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [apiKey, enabled, endpoint]);

  return state;
}
