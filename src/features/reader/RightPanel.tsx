import type { ComponentPropsWithoutRef } from "react";
import type { ReaderPreferences } from "./readerPreferences";
import { AiResultPanel } from "./panels/AiResultPanel";
import { AppearancePanel } from "./panels/AppearancePanel";
import { NoteEditorPanel } from "./panels/NoteEditorPanel";
import { ReaderStatusPanel } from "./panels/ReaderStatusPanel";
import { TtsStatusPanel } from "./panels/TtsStatusPanel";
import type { BrowserTtsVoice } from "../tts/browserTtsClient";

type RightPanelProps = ComponentPropsWithoutRef<"aside"> & {
  annotationCount?: number;
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
  onTtsVoiceChange?: (voiceId: string) => void;
  onTtsVolumeChange?: (volume: number) => void;
  readerStatus?: string;
  ttsRate?: number;
  selectedText?: string;
  ttsStartDisabled?: boolean;
  ttsCurrentText?: string;
  ttsError?: string;
  ttsStatus?: "idle" | "loading" | "playing" | "paused" | "error";
  ttsVoice?: string;
  ttsVoices?: BrowserTtsVoice[];
  ttsVolume?: number;
};

export function RightPanel({
  annotationCount,
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
  onTtsVoiceChange,
  onTtsVolumeChange,
  readerStatus,
  selectedText,
  ttsStartDisabled,
  ttsCurrentText,
  ttsError,
  ttsRate,
  ttsStatus,
  ttsVoice,
  ttsVoices,
  ttsVolume,
  ...props
}: RightPanelProps) {
  return (
    <aside className="reader-tools" {...props}>
      <AiResultPanel error={aiError} result={aiResult} selectedText={selectedText} title={aiTitle} />
      <ReaderStatusPanel annotationCount={annotationCount} selectedText={selectedText} status={readerStatus} />
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
        voiceId={ttsVoice}
        voices={ttsVoices}
        volume={ttsVolume}
        onVoiceChange={onTtsVoiceChange}
        onVolumeChange={onTtsVolumeChange}
      />
      {appearance ? <AppearancePanel onChange={onAppearanceChange} preferences={appearance} /> : null}
      <NoteEditorPanel
        isOpen={noteOpen}
        onChange={onNoteDraftChange}
        onSave={onNoteSave}
        selectedText={selectedText}
        value={noteDraft}
      />
      <p className="reader-tools-hint">Bookmarks, highlights, and notes are stored only in this browser.</p>
    </aside>
  );
}
