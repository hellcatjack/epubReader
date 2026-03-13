import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import type { AnnotationRecord } from "../../lib/types/annotations";
import type { TocItem } from "../../lib/types/books";
import type { SettingsInput } from "../../lib/types/settings";
import { aiService, type AiService } from "../ai/aiService";
import { annotationService } from "../annotations/annotationService";
import { getProgress } from "../bookshelf/progressRepository";
import { defaultSettings, getResolvedSettings } from "../settings/settingsRepository";
import "./reader.css";
import { EpubViewport } from "./EpubViewport";
import type { EpubViewportRuntime } from "./epubRuntime";
import { LeftRail } from "./LeftRail";
import { RightPanel } from "./RightPanel";
import { SelectionPopover } from "./SelectionPopover";
import { TopBar } from "./TopBar";
import { selectionBridge, type ReaderSelection } from "./selectionBridge";

type ReaderPageProps = {
  ai?: Pick<AiService, "explainSelection" | "synthesizeSpeech" | "translateSelection">;
  runtime?: EpubViewportRuntime;
};

export function ReaderPage({ ai = aiService, runtime }: ReaderPageProps) {
  const { bookId } = useParams<{ bookId: string }>();
  const [initialCfi, setInitialCfi] = useState<string>();
  const [locationTarget, setLocationTarget] = useState<string>();
  const [toc, setToc] = useState<TocItem[]>([]);
  const [currentSpineItemId, setCurrentSpineItemId] = useState("");
  const [selectedSelection, setSelectedSelection] = useState<ReaderSelection | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiTitle, setAiTitle] = useState("AI result");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [visibleAnnotations, setVisibleAnnotations] = useState<AnnotationRecord[]>([]);
  const [settings, setSettings] = useState<SettingsInput>(defaultSettings);

  useEffect(() => {
    if (!bookId) {
      setInitialCfi(undefined);
      return;
    }

    void getProgress(bookId).then((progress) => {
      setInitialCfi(progress?.cfi);
      setLocationTarget(progress?.cfi);
    });
  }, [bookId]);

  useEffect(() => {
    void getResolvedSettings().then((nextSettings) => {
      setSettings({
        apiKey: nextSettings.apiKey,
        targetLanguage: nextSettings.targetLanguage,
        theme: nextSettings.theme,
        ttsVoice: nextSettings.ttsVoice,
        fontScale: nextSettings.fontScale,
      });
    });
  }, []);

  useEffect(() => {
    const unsubscribe = selectionBridge.subscribe((selection) => {
      setSelectedSelection(selection);
      setAiError("");
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!bookId || !currentSpineItemId) {
      setVisibleAnnotations([]);
      return;
    }

    void annotationService.queryVisible(bookId, currentSpineItemId).then(setVisibleAnnotations);
  }, [bookId, currentSpineItemId]);

  const selectedText = selectedSelection?.text ?? "";
  const selectedCfiRange = selectedSelection?.cfiRange ?? "";
  const selectedSpineItemId = selectedSelection?.spineItemId ?? currentSpineItemId;

  async function refreshAnnotations() {
    if (!bookId || !selectedSpineItemId) {
      return;
    }

    setVisibleAnnotations(await annotationService.queryVisible(bookId, selectedSpineItemId));
  }

  async function handleTranslate() {
    if (!selectedText) {
      return;
    }

    setAiTitle("Translation");
    setAiError("");
    setAiResult("");

    try {
      const result = await ai.translateSelection(selectedText, {
        targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
      });
      setAiResult(result);
    } catch (error) {
      setAiError(`Translate failed: ${String(error)}`);
    }
  }

  async function handleExplain() {
    if (!selectedText) {
      return;
    }

    setAiTitle("Explanation");
    setAiError("");
    setAiResult("");

    try {
      const result = await ai.explainSelection(selectedText, {
        targetLanguage: settings.targetLanguage || navigator.language || "zh-CN",
      });
      setAiResult(result);
    } catch (error) {
      setAiError(`Explain failed: ${String(error)}`);
    }
  }

  async function handleHighlight() {
    if (!bookId || !selectedText || !selectedCfiRange || !selectedSpineItemId) {
      return;
    }

    await annotationService.createHighlight({
      bookId,
      spineItemId: selectedSpineItemId,
      startCfi: selectedCfiRange,
      endCfi: selectedCfiRange,
      textQuote: selectedText,
      color: "amber",
    });
    await refreshAnnotations();
  }

  function handleAddNote() {
    if (!selectedText) {
      return;
    }

    setNoteOpen(true);
    setNoteDraft("");
  }

  async function handleSaveNote() {
    if (!bookId || !noteDraft || !selectedText || !selectedCfiRange || !selectedSpineItemId) {
      return;
    }

    await annotationService.createNote({
      body: noteDraft,
      bookId,
      color: "amber",
      endCfi: selectedCfiRange,
      spineItemId: selectedSpineItemId,
      startCfi: selectedCfiRange,
      textQuote: selectedText,
    });
    setNoteOpen(false);
    setNoteDraft("");
    await refreshAnnotations();
  }

  const highlights = visibleAnnotations
    .filter((annotation) => annotation.kind === "highlight")
    .map((annotation) => annotation.textQuote);
  const notes = visibleAnnotations
    .filter((annotation) => annotation.kind === "note")
    .map((annotation) => annotation.body);
  const readerStyle: CSSProperties & Record<"--reader-font-scale", string> = {
    "--reader-font-scale": String(settings.fontScale),
  };

  return (
    <main className={`reader-layout theme-${settings.theme}`} style={readerStyle}>
      <LeftRail
        highlights={highlights}
        notes={notes}
        onNavigateToTocItem={setLocationTarget}
        toc={toc}
      />
      <section className="reader-center" aria-label="Reading workspace">
        <TopBar />
        <EpubViewport
          bookId={bookId}
          initialCfi={locationTarget ?? initialCfi}
          onLocationChange={({ spineItemId }) => setCurrentSpineItemId(spineItemId)}
          onTocChange={setToc}
          runtime={runtime}
          visibleAnnotations={visibleAnnotations}
        />
        <SelectionPopover
          hasSelection={selectedText.length > 0}
          onAddNote={handleAddNote}
          onExplain={handleExplain}
          onHighlight={handleHighlight}
          onTranslate={handleTranslate}
        />
      </section>
      <RightPanel
        aiError={aiError}
        aiResult={aiResult}
        aiTitle={aiTitle}
        aria-label="Reader tools"
        noteDraft={noteDraft}
        noteOpen={noteOpen}
        onNoteDraftChange={setNoteDraft}
        onNoteSave={handleSaveNote}
        selectedText={selectedText}
      />
    </main>
  );
}
