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
  onTtsRateChange?: (rate: number) => void;
  onTtsResume?: () => void;
  onTtsStart?: () => void;
  onTtsStop?: () => void;
  ttsRate?: number;
  selectedText?: string;
  ttsStartDisabled?: boolean;
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
  onTtsRateChange,
  onTtsResume,
  onTtsStart,
  onTtsStop,
  selectedText,
  ttsStartDisabled,
  ttsCurrentText,
  ttsError,
  ttsRate,
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
        onRateChange={onTtsRateChange}
        onResume={onTtsResume}
        onStart={onTtsStart}
        onStop={onTtsStop}
        rate={ttsRate}
        startDisabled={ttsStartDisabled}
        status={ttsStatus}
      />
      <p className="reader-tools-hint">Bookmarks, highlights, and notes are stored only in this browser.</p>
    </aside>
  );
}
