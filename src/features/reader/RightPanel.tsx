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
  geminiModel?: string;
  grammarLlmApiUrl?: string;
  grammarLlmModel?: string;
  noteDraft?: string;
  noteOpen?: boolean;
  llmApiUrl?: string;
  localLlmModel?: string;
  onApiKeyChange?: (value: string) => void;
  onAppearanceChange?: (patch: Partial<ReaderPreferences>) => void;
  onGeminiModelChange?: (value: string) => void;
  onGrammarLlmApiUrlChange?: (value: string) => void;
  onGrammarLlmModelChange?: (value: string) => void;
  onLlmApiUrlChange?: (value: string) => void;
  onLocalLlmModelChange?: (value: string) => void;
  onNoteDraftChange?: (value: string) => void;
  onNoteSave?: () => void;
  onSelectionReadAloud?: () => void;
  onTtsPause?: () => void;
  onTtsFollowPlaybackChange?: (enabled: boolean) => void;
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
  englishDefinition?: string;
  selectedText?: string;
  translation?: string;
  translationError?: string;
  translationProvider?: TranslationProvider;
  ttsStartDisabled?: boolean;
  ttsCurrentText?: string;
  ttsError?: string;
  ttsFollowPlayback?: boolean;
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
  geminiModel,
  grammarLlmApiUrl,
  grammarLlmModel,
  llmApiUrl,
  localLlmModel,
  noteDraft,
  noteOpen,
  onApiKeyChange,
  onAppearanceChange,
  onGeminiModelChange,
  onGrammarLlmApiUrlChange,
  onGrammarLlmModelChange,
  onLlmApiUrlChange,
  onLocalLlmModelChange,
  onNoteDraftChange,
  onNoteSave,
  onSelectionReadAloud,
  onTtsPause,
  onTtsFollowPlaybackChange,
  onTtsRateChange,
  onTtsResume,
  onTtsStartPointerDown,
  onTtsStart,
  onTtsStop,
  onTtsVoiceChange,
  onTtsVolumeChange,
  onTranslationProviderChange,
  readerStatus,
  englishDefinition,
  selectedText,
  translation,
  translationError,
  translationProvider,
  ttsStartDisabled,
  ttsCurrentText,
  ttsError,
  ttsFollowPlayback,
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
          followPlayback={ttsFollowPlayback}
          onFollowPlaybackChange={onTtsFollowPlaybackChange}
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
          englishDefinition={englishDefinition}
          ipa={aiIpa}
          onReadAloud={onSelectionReadAloud}
          selectedText={selectedText}
          translation={translation}
          translationError={translationError}
        />
        <ReaderStatusPanel annotationCount={annotationCount} selectedText={selectedText} status={readerStatus} />
        {appearance ? (
          <AppearancePanel
            apiKey={apiKey}
            geminiModel={geminiModel}
            grammarLlmApiUrl={grammarLlmApiUrl}
            grammarLlmModel={grammarLlmModel}
            llmApiUrl={llmApiUrl}
            localLlmModel={localLlmModel}
            onApiKeyChange={onApiKeyChange}
            onChange={onAppearanceChange}
            onGeminiModelChange={onGeminiModelChange}
            onGrammarLlmApiUrlChange={onGrammarLlmApiUrlChange}
            onGrammarLlmModelChange={onGrammarLlmModelChange}
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
