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
  onTtsPause?: () => void;
  onTtsResume?: () => void;
  onTtsStart?: () => void;
  onTtsStop?: () => void;
  selectedText?: string;
  ttsCurrentText?: string;
  ttsError?: string;
  ttsStatus?: "idle" | "loading" | "playing" | "paused" | "error";
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
  onTtsPause,
  onTtsResume,
  onTtsStart,
  onTtsStop,
  selectedText,
  ttsCurrentText,
  ttsError,
  ttsStatus,
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
      <TtsStatusPanel
        currentText={ttsCurrentText}
        error={ttsError}
        onPause={onTtsPause}
        onResume={onTtsResume}
        onStart={onTtsStart}
        onStop={onTtsStop}
        status={ttsStatus}
      />
      <p className="reader-tools-hint">Bookmarks, highlights, and notes are stored only in this browser.</p>
    </aside>
  );
}
