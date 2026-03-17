import { registerSW } from "virtual:pwa-register";

export function registerProductionServiceWorker() {
  return registerSW({
    immediate: true,
    onOfflineReady() {
      console.info("PWA offline cache ready");
    },
  });
}
