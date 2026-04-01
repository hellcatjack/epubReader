import { useSyncExternalStore } from "react";

type ApplyUpdate = () => Promise<void>;

type PwaStatusSnapshot = {
  applyUpdate: ApplyUpdate | null;
  updateAvailable: boolean;
};

let snapshot: PwaStatusSnapshot = {
  applyUpdate: null,
  updateAvailable: false,
};

const listeners = new Set<() => void>();

function emit(nextSnapshot: PwaStatusSnapshot) {
  snapshot = nextSnapshot;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function publishUpdateAvailable(applyUpdate: ApplyUpdate) {
  emit({
    applyUpdate,
    updateAvailable: true,
  });
}

export function clearPublishedUpdate() {
  emit({
    applyUpdate: null,
    updateAvailable: false,
  });
}

export function usePwaStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
