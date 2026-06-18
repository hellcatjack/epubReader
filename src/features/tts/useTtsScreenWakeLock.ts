import { useEffect } from "react";

type ScreenWakeLockSentinel = {
  addEventListener?: (type: "release", listener: () => void) => void;
  release: () => Promise<void>;
  released?: boolean;
  removeEventListener?: (type: "release", listener: () => void) => void;
};

type ScreenWakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

type UseTtsScreenWakeLockDeps = {
  document?: Document;
  navigator?: ScreenWakeLockNavigator;
};

export function useTtsScreenWakeLock(enabled: boolean, deps: UseTtsScreenWakeLockDeps = {}) {
  const documentLike = deps.document ?? (typeof document === "undefined" ? undefined : document);
  const navigatorLike =
    deps.navigator ?? (typeof navigator === "undefined" ? undefined : (navigator as ScreenWakeLockNavigator));

  useEffect(() => {
    const wakeLock = navigatorLike?.wakeLock;
    if (!enabled || !documentLike || !wakeLock) {
      return undefined;
    }

    let cancelled = false;
    let sentinel: ScreenWakeLockSentinel | null = null;

    const handleRelease = () => {
      sentinel?.removeEventListener?.("release", handleRelease);
      sentinel = null;
    };

    const releaseWakeLock = () => {
      const activeSentinel = sentinel;
      sentinel = null;
      activeSentinel?.removeEventListener?.("release", handleRelease);
      if (activeSentinel && !activeSentinel.released) {
        void activeSentinel.release().catch(() => undefined);
      }
    };

    const requestWakeLock = async () => {
      if (sentinel || documentLike.visibilityState !== "visible") {
        return;
      }

      try {
        const nextSentinel = await wakeLock.request("screen");
        if (cancelled) {
          void nextSentinel.release().catch(() => undefined);
          return;
        }

        sentinel = nextSentinel;
        sentinel.addEventListener?.("release", handleRelease);
      } catch {
        sentinel = null;
      }
    };

    const handleVisibilityChange = () => {
      if (documentLike.visibilityState === "visible") {
        void requestWakeLock();
        return;
      }

      releaseWakeLock();
    };

    void requestWakeLock();
    documentLike.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      documentLike.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [documentLike, enabled, navigatorLike]);
}
