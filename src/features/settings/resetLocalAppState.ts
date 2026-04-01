import { resetDb } from "../../lib/db/appDb";
import { clearExistingCaches, clearExistingServiceWorkers } from "../../pwa/registerServiceWorker";

export async function resetLocalAppState() {
  await Promise.allSettled([
    resetDb(),
    clearExistingCaches(),
    clearExistingServiceWorkers(),
  ]);

  if (typeof sessionStorage !== "undefined") {
    sessionStorage.clear();
  }

  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }

  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
