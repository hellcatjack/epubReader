import type { ComponentPropsWithoutRef } from "react";
import type { TranslationProvider } from "../../lib/types/settings";
import type { ReaderPreferences } from "./readerPreferences";
import { AiResultPanel } from "./panels/AiResultPanel";
import { AppearancePanel } from "./panels/AppearancePanel";
import { NoteEditorPanel } from "./panels/NoteEditorPanel";
import { ReaderStatusPanel } from "./panels/ReaderStatusPanel";
import { TtsStatusPanel } from "./panels/TtsStatusPanel";
import type { BrowserTtsVoice } from "../tts/browserTtsClient";

type RightPanelProps = ComponentPropsWithoutRef<"aside"> & {
  annotationCount?: number;
  apiKey?: string;
  aiIpa?: string;
  appearance?: ReaderPreferences;
  explanation?: string;
  explanationError?: string;
  geminiModel?: string;
  noteDraft?: string;
  noteOpen?: boolean;
  llmApiUrl?: string;
  localLlmModel?: string;
  onApiKeyChange?: (value: string) => void;
  onAppearanceChange?: (patch: Partial<ReaderPreferences>) => void;
  onGeminiModelChange?: (value: string) => void;
  onLlmApiUrlChange?: (value: string) => void;
  onLocalLlmModelChange?: (value: string) => void;
  onNoteDraftChange?: (value: string) => void;
  onNoteSave?: () => void;
  onTtsPause?: () => void;
  onTtsRateChange?: (rate: number) => void;
  onTtsResume?: () => void;
  onTtsStartPointerDown?: () => void;
  onTtsStart?: () => void;
  onTtsStop?: () => void;
  onTtsVoiceChange?: (voiceId: string) => void;
  onTtsVolumeChange?: (volume: number) => void;
  onTranslationProviderChange?: (value: TranslationProvider) => void;
  readerStatus?: string;
  ttsRate?: number;
  selectedText?: string;
  translation?: string;
  translationError?: string;
  translationProvider?: TranslationProvider;
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
  apiKey,
  aiIpa,
  appearance,
  explanation,
  explanationError,
  geminiModel,
  llmApiUrl,
  localLlmModel,
  noteDraft,
  noteOpen,
  onApiKeyChange,
  onAppearanceChange,
  onGeminiModelChange,
  onLlmApiUrlChange,
  onLocalLlmModelChange,
  onNoteDraftChange,
  onNoteSave,
  onTtsPause,
  onTtsRateChange,
  onTtsResume,
  onTtsStartPointerDown,
  onTtsStart,
  onTtsStop,
  onTtsVoiceChange,
  onTtsVolumeChange,
  onTranslationProviderChange,
  readerStatus,
  selectedText,
  translation,
  translationError,
  translationProvider,
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
          onStartPointerDown={onTtsStartPointerDown}
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
            apiKey={apiKey}
            geminiModel={geminiModel}
            llmApiUrl={llmApiUrl}
            localLlmModel={localLlmModel}
            onApiKeyChange={onApiKeyChange}
            onChange={onAppearanceChange}
            onGeminiModelChange={onGeminiModelChange}
            onLlmApiUrlChange={onLlmApiUrlChange}
            onLocalLlmModelChange={onLocalLlmModelChange}
            onTranslationProviderChange={onTranslationProviderChange}
            preferences={appearance}
            translationProvider={translationProvider}
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
