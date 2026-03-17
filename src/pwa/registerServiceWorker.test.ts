import { afterEach, describe, expect, it, vi } from "vitest";

const registerProductionServiceWorkerMock = vi.fn();

vi.mock("./pwaRegister", () => ({
  registerProductionServiceWorker: (...args: unknown[]) => registerProductionServiceWorkerMock(...args),
}));

async function importRegisterServiceWorker() {
  return import("./registerServiceWorker");
}

afterEach(() => {
  registerProductionServiceWorkerMock.mockReset();
  vi.unstubAllGlobals();
});

describe("registerServiceWorker", () => {
  it("unregisters stale service workers and clears caches in dev mode", async () => {
    const unregister = vi.fn(async () => true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: vi.fn(async () => [{ unregister }]),
      },
    });
    vi.stubGlobal("caches", {
      delete: vi.fn(async () => true),
      keys: vi.fn(async () => ["workbox-precache-v2", "reader-assets"]),
    });

    const { registerServiceWorker } = await importRegisterServiceWorker();
    await registerServiceWorker({ isDev: true });

    expect(registerProductionServiceWorkerMock).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(caches.keys).toHaveBeenCalledTimes(1);
    expect(caches.delete).toHaveBeenNthCalledWith(1, "workbox-precache-v2");
    expect(caches.delete).toHaveBeenNthCalledWith(2, "reader-assets");
  });

  it("registers the production service worker outside dev mode", async () => {
    const { registerServiceWorker } = await importRegisterServiceWorker();

    await registerServiceWorker({ isDev: false });

    expect(registerProductionServiceWorkerMock).toHaveBeenCalledTimes(1);
  });
});
