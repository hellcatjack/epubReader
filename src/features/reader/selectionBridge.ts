import type { RuntimeTtsBlock } from "./epubRuntime";

export type ReaderSelectionRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type ReaderSelection = {
  cfiRange?: string;
  isReleased?: boolean;
  selectionRect?: ReaderSelectionRect;
  sentenceContext?: string;
  spineItemId?: string;
  text: string;
  ttsBlocks?: RuntimeTtsBlock[];
};

type SelectionListener = (selection: ReaderSelection | null) => void;

export function createSelectionBridge() {
  const listeners = new Set<SelectionListener>();
  let currentSelection: ReaderSelection | null = null;

  return {
    publish(selection: ReaderSelection | null) {
      currentSelection = selection;
      listeners.forEach((listener) => listener(selection));
    },
    read() {
      return currentSelection;
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
