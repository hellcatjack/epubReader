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
  aiIpa?: string;
  appearance?: ReaderPreferences;
  explanation?: string;
  explanationError?: string;
  noteDraft?: string;
  noteOpen?: boolean;
  llmApiUrl?: string;
  onAppearanceChange?: (patch: Partial<ReaderPreferences>) => void;
  onLlmApiUrlChange?: (value: string) => void;
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
  translation?: string;
  translationError?: string;
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
  aiIpa,
  appearance,
  explanation,
  explanationError,
  llmApiUrl,
  noteDraft,
  noteOpen,
  onAppearanceChange,
  onLlmApiUrlChange,
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
  translation,
  translationError,
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
      <div className="reader-tools-primary">
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
      </div>
      <div className="reader-tools-scroll" role="group" aria-label="Reader detail panels">
        <AiResultPanel
          explanation={explanation}
          explanationError={explanationError}
          ipa={aiIpa}
          selectedText={selectedText}
          translation={translation}
          translationError={translationError}
        />
        <ReaderStatusPanel annotationCount={annotationCount} selectedText={selectedText} status={readerStatus} />
        {appearance ? (
          <AppearancePanel
            llmApiUrl={llmApiUrl}
            onChange={onAppearanceChange}
            onLlmApiUrlChange={onLlmApiUrlChange}
            preferences={appearance}
          />
        ) : null}
        <NoteEditorPanel
          isOpen={noteOpen}
          onChange={onNoteDraftChange}
          onSave={onNoteSave}
          selectedText={selectedText}
          value={noteDraft}
        />
        <p className="reader-tools-hint">Bookmarks, highlights, and notes are stored only in this browser.</p>
      </div>
    </aside>
  );
}
