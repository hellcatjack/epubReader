import { useEffect, useState } from "react";
import { listLocalModels } from "./localModelDiscovery";

type LocalModelState = {
  models: string[];
  status: "idle" | "loading" | "ready" | "error";
};

export function useLocalLlmModels(endpoint: string, enabled = true) {
  const [state, setState] = useState<LocalModelState>({
    models: [],
    status: enabled ? "loading" : "idle",
  });

  useEffect(() => {
    if (!enabled) {
      setState({ models: [], status: "idle" });
      return;
    }

    let cancelled = false;
    setState((current) => ({
      models: current.models,
      status: "loading",
    }));

    void listLocalModels(endpoint)
      .then((models) => {
        if (cancelled) {
          return;
        }

        setState({
          models,
          status: "ready",
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({
          models: [],
          status: "error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, endpoint]);

  return state;
}
