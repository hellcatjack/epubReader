import { registerProductionServiceWorker } from "./pwaRegister";

type RegisterServiceWorkerOptions = {
  isDev?: boolean;
};

async function clearExistingServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

async function clearExistingCaches() {
  if (typeof caches === "undefined") {
    return;
  }

  const cacheKeys = await caches.keys();
  await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
}

export async function registerServiceWorker(options: RegisterServiceWorkerOptions = {}) {
  const isDev = options.isDev ?? import.meta.env.DEV;

  if (isDev) {
    await clearExistingServiceWorkers();
    await clearExistingCaches();
    return undefined;
  }

  return registerProductionServiceWorker();
}
