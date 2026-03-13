import { registerSW } from "virtual:pwa-register";

export function registerServiceWorker() {
  return registerSW({
    immediate: true,
    onOfflineReady() {
      console.info("PWA offline cache ready");
    },
  });
}
