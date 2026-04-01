import { clearPublishedUpdate, publishUpdateAvailable } from "./usePwaStatus";

export async function registerProductionServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return undefined;
  }

  const registration = await navigator.serviceWorker.register("/sw.js");

  const applyUpdate = async () => {
    const waitingWorker = registration.waiting;
    clearPublishedUpdate();

    if (!waitingWorker) {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
      return;
    }

    await new Promise<void>((resolve) => {
      const handleControllerChange = () => {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
        resolve();
      };

      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    });
  };

  if (registration.waiting && navigator.serviceWorker.controller) {
    publishUpdateAvailable(applyUpdate);
  }

  registration.addEventListener("updatefound", () => {
    const nextWorker = registration.installing;
    if (!nextWorker) {
      return;
    }

    nextWorker.addEventListener("statechange", () => {
      if (nextWorker.state !== "installed") {
        return;
      }

      if (navigator.serviceWorker.controller) {
        publishUpdateAvailable(applyUpdate);
        return;
      }

      console.info("PWA offline cache ready");
    });
  });

  return applyUpdate;
}
