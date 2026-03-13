import type { ComponentPropsWithoutRef } from "react";
import { AiResultPanel } from "./panels/AiResultPanel";
import { NoteEditorPanel } from "./panels/NoteEditorPanel";
import { TtsStatusPanel } from "./panels/TtsStatusPanel";

type RightPanelProps = ComponentPropsWithoutRef<"aside"> & {
  aiError?: string;
  aiResult?: string;
  aiTitle?: string;
  noteDraft?: string;
  noteOpen?: boolean;
  onNoteDraftChange?: (value: string) => void;
  onNoteSave?: () => void;
  selectedText?: string;
};

export function RightPanel({
  aiError,
  aiResult,
  aiTitle,
  noteDraft,
  noteOpen,
  onNoteDraftChange,
  onNoteSave,
  selectedText,
  ...props
}: RightPanelProps) {
  return (
    <aside className="reader-tools" {...props}>
      <AiResultPanel error={aiError} result={aiResult} selectedText={selectedText} title={aiTitle} />
      <NoteEditorPanel
        isOpen={noteOpen}
        onChange={onNoteDraftChange}
        onSave={onNoteSave}
        selectedText={selectedText}
        value={noteDraft}
      />
      <TtsStatusPanel />
      <p className="reader-tools-hint">Bookmarks, highlights, and notes are stored only in this browser.</p>
    </aside>
  );
}
