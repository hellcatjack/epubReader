import type { ComponentPropsWithoutRef } from "react";
import type { ReaderPreferences } from "./readerPreferences";
import { AiResultPanel } from "./panels/AiResultPanel";
import { AppearancePanel } from "./panels/AppearancePanel";
import { NoteEditorPanel } from "./panels/NoteEditorPanel";
import { TtsStatusPanel } from "./panels/TtsStatusPanel";

type RightPanelProps = ComponentPropsWithoutRef<"aside"> & {
  aiError?: string;
  aiResult?: string;
  aiTitle?: string;
  appearance?: ReaderPreferences;
  noteDraft?: string;
  noteOpen?: boolean;
  onAppearanceChange?: (patch: Partial<ReaderPreferences>) => void;
  onNoteDraftChange?: (value: string) => void;
  onNoteSave?: () => void;
  selectedText?: string;
};

export function RightPanel({
  aiError,
  aiResult,
  aiTitle,
  appearance,
  noteDraft,
  noteOpen,
  onAppearanceChange,
  onNoteDraftChange,
  onNoteSave,
  selectedText,
  ...props
}: RightPanelProps) {
  return (
    <aside className="reader-tools" {...props}>
      <AiResultPanel error={aiError} result={aiResult} selectedText={selectedText} title={aiTitle} />
      {appearance ? <AppearancePanel onChange={onAppearanceChange} preferences={appearance} /> : null}
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
