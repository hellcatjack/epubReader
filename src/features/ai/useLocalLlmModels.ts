import { useEffect, useState } from "react";
import { listLocalModels, LocalModelDiscoveryBlockedError } from "./localModelDiscovery";

type LocalModelState = {
  message: string;
  models: string[];
  status: "idle" | "loading" | "ready" | "error" | "blocked";
};

export function useLocalLlmModels(endpoint: string, enabled = true) {
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
    setState((current) => ({
      message: "",
      models: current.models,
      status: "loading",
    }));

    void listLocalModels(endpoint)
      .then((models) => {
        if (cancelled) {
          return;
        }

        setState({
          message: "",
          models,
          status: "ready",
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setState({
          message: error instanceof LocalModelDiscoveryBlockedError ? error.message : "",
          models: [],
          status: error instanceof LocalModelDiscoveryBlockedError ? "blocked" : "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, endpoint]);

  return state;
}
