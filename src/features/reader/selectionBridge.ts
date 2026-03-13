export type ReaderSelection = {
  text: string;
};

type SelectionListener = (selection: ReaderSelection | null) => void;

export function createSelectionBridge() {
  const listeners = new Set<SelectionListener>();

  return {
    publish(selection: ReaderSelection | null) {
      listeners.forEach((listener) => listener(selection));
    },
    subscribe(listener: SelectionListener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const selectionBridge = createSelectionBridge();
