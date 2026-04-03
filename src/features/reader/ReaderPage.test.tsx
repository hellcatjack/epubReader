import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import { db, resetDb } from "../../lib/db/appDb";
import type { ReaderAppShellContext } from "../../app/readerAppShellContext";
import type { AiService } from "../ai/aiService";
import { defaultSettings, getSettings } from "../settings/settingsRepository";
import { writeRefreshSettingsSnapshot } from "../settings/refreshSettingsSnapshot";
import type { ActiveTtsSegment, RuntimeRenderHandle } from "./epubRuntime";
import { ReaderPage } from "./ReaderPage";
import { selectionBridge } from "./selectionBridge";

const getProgressMock = vi.fn().mockResolvedValue(null);
const saveProgressMock = vi.fn().mockResolvedValue(undefined);
const DEFAULT_TEST_LLM_API_URL = "http://localhost:8001/v1/chat/completions";

vi.mock("../bookshelf/progressRepository", async () => {
  const actual = await vi.importActual<typeof import("../bookshelf/progressRepository")>(
    "../bookshelf/progressRepository",
  );

  return {
    ...actual,
    getProgress: (...args: Parameters<typeof actual.getProgress>) => getProgressMock(...args),
    saveProgress: (...args: Parameters<typeof actual.saveProgress>) => saveProgressMock(...args),
  };
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  getProgressMock.mockReset();
  getProgressMock.mockResolvedValue(null);
  saveProgressMock.mockReset();
  saveProgressMock.mockResolvedValue(undefined);
  sessionStorage.clear();
  act(() => {
    selectionBridge.publish(null);
  });
  await resetDb();
});

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

function installMatchMedia(matchesByQuery: Record<string, boolean>) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches: matchesByQuery[query] ?? false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

function installSpeechSynthesis(voices: SpeechSynthesisVoice[], options: { autoStart?: boolean } = {}) {
  const { autoStart = true } = options;
  let currentUtterance: SpeechSynthesisUtterance | undefined;
  const speechSynthesis = {
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    pause: vi.fn(),
    pending: false,
    removeEventListener: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      currentUtterance = utterance;
      if (autoStart) {
        currentUtterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
      }
    }),
    speaking: false,
  } as unknown as SpeechSynthesis;

  vi.stubGlobal("speechSynthesis", speechSynthesis);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      onstart: ((event: Event) => void) | null = null;
      onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      rate = 1;
      text: string;
      voice: SpeechSynthesisVoice | null = null;
      volume = 1;

      constructor(text: string) {
        this.text = text;
      }
    },
  );

  return {
    emitBoundary(charIndex: number) {
      const boundaryEvent = { charIndex } as SpeechSynthesisEvent;
      (currentUtterance as (SpeechSynthesisUtterance & { onboundary?: (event: SpeechSynthesisEvent) => void }) | undefined)
        ?.onboundary?.(boundaryEvent);
    },
    startCurrent() {
      currentUtterance?.onstart?.(new Event("start") as SpeechSynthesisEvent);
    },
    finishCurrent() {
      currentUtterance?.onend?.(new Event("end") as SpeechSynthesisEvent);
    },
    speechSynthesis,
  };
}

function createStoredSettings(overrides: Partial<(typeof defaultSettings)> = {}) {
  return {
    id: "settings" as const,
    ...defaultSettings,
    ...overrides,
  };
}

function createSettingsInput(overrides: Partial<typeof defaultSettings> = {}) {
  return {
    ...defaultSettings,
    ...overrides,
  };
}

it("does not expose paginated continuous tts markers before speech actually starts", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis(
    [
      {
        default: true,
        lang: "en-US",
        localService: false,
        name: "Microsoft Ava Online (Natural)",
        voiceURI: "Microsoft Ava Online (Natural)",
      },
    ],
    { autoStart: false },
  );
  await db.settings.put(createStoredSettings({
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));

  const goTo = vi.fn(async () => undefined);
  const setActiveTtsSegment = vi.fn<(segment: ActiveTtsSegment | null) => Promise<void>>(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () => "First paragraph on the current page.\n\nSecond paragraph on the next page.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph on the next page.",
                      },
                    ]),
                    getCurrentLocation: vi.fn(async () => ({
                      cfi: "epubcfi(/6/2!/4/1:0)",
                      progress: 0.2,
                      spineItemId: "chap-1",
                      textQuote: "First paragraph on the current page.",
                    })),
                    goTo,
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment,
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & {
                    getCurrentLocation: NonNullable<RuntimeRenderHandle["getCurrentLocation"]>;
                    getTtsBlocksFromCurrentLocation: NonNullable<RuntimeRenderHandle["getTtsBlocksFromCurrentLocation"]>;
                    setActiveTtsSegment: typeof setActiveTtsSegment;
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await act(async () => {
    await Promise.resolve();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  expect(goTo).not.toHaveBeenCalled();
  expect(setActiveTtsSegment.mock.calls.some(([segment]) => Boolean(segment))).toBe(false);
});

it("shows toc, reading progress, bookmark toggle, and the reader tools surface", () => {
  render(<ReaderPage />);

  expect(screen.getByRole("navigation", { name: /table of contents/i })).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: /reading progress/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bookmark this location/i })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: /reader tools/i })).toBeInTheDocument();
});

it("uses drawer toggles instead of inline side panels on tablet-sized viewports", async () => {
  const user = userEvent.setup();
  installMatchMedia({ "(max-width: 1180px)": true });

  render(<ReaderPage />);

  expect(screen.queryByRole("navigation", { name: /table of contents/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: /reader tools/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /contents/i }));
  const contentsDrawer = await screen.findByRole("dialog", { name: /contents drawer/i });
  expect(contentsDrawer).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: /table of contents/i })).toBeInTheDocument();
  await user.click(within(contentsDrawer).getByRole("button", { name: /close contents/i }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: /contents drawer/i })).not.toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: /tools/i }));
  expect(await screen.findByRole("dialog", { name: /reader tools drawer/i })).toBeInTheDocument();
});

it("shows a temporary translation bubble on tablet-sized viewports", async () => {
  installMatchMedia({ "(max-width: 1180px)": true });
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    explainSelection: vi.fn(async () => "context"),
    translateSelection: vi.fn(async () => "获得"),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/2/1:0)",
      isReleased: true,
      selectionRect: {
        bottom: 246,
        height: 24,
        left: 120,
        right: 280,
        top: 222,
        width: 160,
      },
      spineItemId: "chapter-1.xhtml",
      text: "earns",
    } as any);
  });

  expect(await screen.findByRole("status", { name: /selection translation/i })).toHaveTextContent("获得");

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 3100));
  });

  await waitFor(() => {
    expect(screen.queryByRole("status", { name: /selection translation/i })).not.toBeInTheDocument();
  });
});

it("shows a spoken sentence translation note beside the reading text on wide screens during continuous tts", async () => {
  const user = userEvent.setup();
  installMatchMedia({ "(max-width: 1180px)": false });
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    explainSelection: vi.fn(async () => ""),
    translateSelection: vi.fn(async () => "第一句翻译"),
  };
  await db.settings.put(
    createStoredSettings({
      ttsSentenceTranslationFontScale: 1.3,
    }),
  );

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              ai={ai}
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/2/1:0)",
                    progress: 0.2,
                    spineItemId: "chapter-10.xhtml",
                    textQuote: "First paragraph.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentLocation: vi.fn(async () => ({
                      cfi: "epubcfi(/6/2!/4/2/1:0)",
                      progress: 0.2,
                      spineItemId: "chapter-10.xhtml",
                      textQuote: "First paragraph.",
                    })),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph. Second sentence."),
                    getTtsSentenceNoteMetrics: vi.fn(() => ({
                      activeRect: {
                        bottom: 288,
                        height: 28,
                        left: 460,
                        right: 720,
                        top: 260,
                        width: 260,
                      },
                      readingRect: {
                        bottom: 940,
                        height: 800,
                        left: 120,
                        right: 820,
                        top: 140,
                        width: 700,
                      },
                    })),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  const readerStage = screen.getByRole("region", { name: /reader stage/i });
  Object.defineProperty(readerStage, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        bottom: 980,
        height: 860,
        left: 80,
        right: 1180,
        top: 120,
        width: 1100,
      }) as DOMRect,
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  const note = await screen.findByRole("status", { name: /spoken sentence translation/i });
  expect(note).toHaveTextContent("第一句翻译");
  expect(readerStage.contains(note)).toBe(true);
  expect(note).toHaveStyle({ "--reader-tts-sentence-note-text-scale": "1.3" });
});

it("keeps the spoken sentence translation note hidden in tablet layout", async () => {
  const user = userEvent.setup();
  installMatchMedia({ "(max-width: 1180px)": true });
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    explainSelection: vi.fn(async () => ""),
    translateSelection: vi.fn(async () => "第一句翻译"),
  };

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              ai={ai}
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/2/1:0)",
                    progress: 0.2,
                    spineItemId: "chapter-10.xhtml",
                    textQuote: "First paragraph.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentLocation: vi.fn(async () => ({
                      cfi: "epubcfi(/6/2!/4/2/1:0)",
                      progress: 0.2,
                      spineItemId: "chapter-10.xhtml",
                      textQuote: "First paragraph.",
                    })),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph. Second sentence."),
                    getTtsSentenceNoteMetrics: vi.fn(() => ({
                      activeRect: {
                        bottom: 288,
                        height: 28,
                        left: 460,
                        right: 720,
                        top: 260,
                        width: 260,
                      },
                      readingRect: {
                        bottom: 940,
                        height: 800,
                        left: 120,
                        right: 820,
                        top: 140,
                        width: 700,
                      },
                    })),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  const readerStage = screen.getByRole("region", { name: /reader stage/i });
  Object.defineProperty(readerStage, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        bottom: 980,
        height: 860,
        left: 80,
        right: 1180,
        top: 120,
        width: 1100,
      }) as DOMRect,
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /tools/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /tools/i }));
  await user.click(await screen.findByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(screen.queryByRole("status", { name: /spoken sentence translation/i })).not.toBeInTheDocument();
  });
});

it("does not reuse the previous translation bubble content while a new tablet selection is still being dragged", async () => {
  installMatchMedia({ "(max-width: 1180px)": true });
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    explainSelection: vi.fn(async () => "context"),
    translateSelection: vi
      .fn<AiService["translateSelection"]>()
      .mockResolvedValueOnce("旧翻译")
      .mockResolvedValueOnce("新翻译"),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/2/1:0)",
      isReleased: true,
      selectionRect: {
        bottom: 246,
        height: 24,
        left: 120,
        right: 280,
        top: 222,
        width: 160,
      },
      spineItemId: "chapter-1.xhtml",
      text: "earns",
    } as any);
  });

  expect(await screen.findByRole("status", { name: /selection translation/i })).toHaveTextContent("旧翻译");

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/2/1:6)",
      isReleased: false,
      selectionRect: {
        bottom: 276,
        height: 24,
        left: 180,
        right: 320,
        top: 252,
        width: 140,
      },
      spineItemId: "chapter-1.xhtml",
      text: "rank",
    } as any);
  });

  expect(screen.queryByRole("status", { name: /selection translation/i })).not.toBeInTheDocument();
});

it("does not auto-translate on tablet while the mouse is still held down even if the runtime snapshot already has selection geometry", async () => {
  installMatchMedia({ "(max-width: 1180px)": true });
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    explainSelection: vi.fn(async () => "context"),
    translateSelection: vi.fn(async () => "不应该提前触发"),
  };
  const getCurrentSelectionSnapshot = vi.fn(() => ({
    cfiRange: "epubcfi(/6/2!/4/2/1:0)",
    isReleased: true,
    selectionRect: {
      bottom: 246,
      height: 24,
      left: 120,
      right: 280,
      top: 222,
      width: 160,
    },
    spineItemId: "chapter-1.xhtml",
    text: "earns",
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              ai={ai}
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chapter-1.xhtml",
                    textQuote: "Hello world from the minimal valid fixture.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelectionSnapshot,
                    getTextFromCurrentLocation: vi.fn(async () => "Hello world from the minimal valid fixture."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await act(async () => {
    await Promise.resolve();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/2/1:0)",
      isReleased: false,
      spineItemId: "chapter-1.xhtml",
      text: "earns",
    });
  });

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 220));
  });

  expect(getCurrentSelectionSnapshot).toHaveBeenCalled();
  expect(ai.translateSelection).not.toHaveBeenCalled();
  expect(screen.queryByRole("status", { name: /selection translation/i })).not.toBeInTheDocument();
});

it("auto-translates a stable tablet selection after one second without repeating on mouseup", async () => {
  installMatchMedia({ "(max-width: 1180px)": true });
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    explainSelection: vi.fn(async () => "context"),
    translateSelection: vi.fn(async () => "稳定触发的翻译"),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/2/1:0)",
      isReleased: false,
      selectionRect: {
        bottom: 246,
        height: 24,
        left: 120,
        right: 280,
        top: 222,
        width: 160,
      },
      spineItemId: "chapter-1.xhtml",
      text: "earns",
    } as any);
  });

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 900));
  });

  expect(ai.translateSelection).not.toHaveBeenCalled();

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  });

  expect(ai.translateSelection).toHaveBeenCalledTimes(1);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/2/1:0)",
      isReleased: true,
      selectionRect: {
        bottom: 246,
        height: 24,
        left: 120,
        right: 280,
        top: 222,
        width: 160,
      },
      spineItemId: "chapter-1.xhtml",
      text: "earns",
    } as any);
  });

  await act(async () => {
    await Promise.resolve();
  });

  expect(ai.translateSelection).toHaveBeenCalledTimes(1);
});

it("shows a tablet translation bubble when the released selection text exists but its anchor rect must be recovered from the runtime snapshot", async () => {
  installMatchMedia({ "(max-width: 1180px)": true });
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    explainSelection: vi.fn(async () => "context"),
    translateSelection: vi.fn(async () => "补抓定位后的翻译"),
  };
  const getCurrentSelectionSnapshot = vi.fn(() => ({
    cfiRange: "epubcfi(/6/2!/4/2/1:0)",
    isReleased: true,
    selectionRect: {
      bottom: 246,
      height: 24,
      left: 120,
      right: 280,
      top: 222,
      width: 160,
    },
    spineItemId: "chapter-1.xhtml",
    text: "earns",
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              ai={ai}
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chapter-1.xhtml",
                    textQuote: "Hello world from the minimal valid fixture.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelectionSnapshot,
                    getTextFromCurrentLocation: vi.fn(async () => "Hello world from the minimal valid fixture."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await act(async () => {
    await Promise.resolve();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/2/1:0)",
      isReleased: true,
      spineItemId: "chapter-1.xhtml",
      text: "earns",
    });
  });

  expect(await screen.findByRole("status", { name: /selection translation/i })).toHaveTextContent("补抓定位后的翻译");
});

it("persists follow playback from the tts queue and forwards it to the runtime", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  const setTtsPlaybackFollow = vi.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph on the current page."),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                    setTtsPlaybackFollow,
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(await screen.findByRole("button", { name: /voice, speed, volume/i }));
  await user.click(screen.getByRole("checkbox", { name: /follow tts playback/i }));

  await waitFor(() => {
    expect(setTtsPlaybackFollow).toHaveBeenLastCalledWith(true);
  });

  await expect(getSettings()).resolves.toMatchObject({
    ttsFollowPlayback: true,
  });
});

it("shows the deepest current section breadcrumb in the top bar instead of the local annotations label", async () => {
  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated, onTocChange }) => {
                  onTocChange?.([
                    {
                      children: [
                        {
                          children: [
                            {
                              id: "genesis-10-heading",
                              label: "Nations Descended from Noah",
                              target: "genesis.xhtml#heading",
                            },
                          ],
                          id: "genesis-10",
                          label: "Chapter 10",
                          target: "genesis.xhtml#chapter-10",
                        },
                      ],
                      id: "genesis",
                      label: "GENESIS",
                      target: "genesis.xhtml#book",
                    },
                  ]);
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/166/2[v01010001]/2/1:0)",
                    progress: 0.42,
                    sectionPath: ["GENESIS", "Chapter 10", "Nations Descended from Noah"],
                    spineItemId: "genesis.xhtml",
                    textQuote: "These are the generations of the sons of Noah.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "These are the generations of the sons of Noah."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText("Current section")).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByLabelText("Current section")).toHaveTextContent(
      "GENESIS / Chapter 10 / Nations Descended from Noah",
    );
  });
  expect(screen.queryByText(/local annotations enabled/i)).not.toBeInTheDocument();
});

it("navigates toc targets through the active runtime handle instead of reopening the viewport", async () => {
  await db.settings.put(createStoredSettings({
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));
  const user = userEvent.setup();
  const goTo = vi.fn(async () => undefined);
  const runtime = {
    render: vi.fn(async ({ onRelocated, onTocChange }) => {
      onTocChange?.([
        {
          children: [],
          id: "chapter-2",
          label: "Chapter 2",
          target: "chapter-2.xhtml",
        },
      ]);
      onRelocated?.({
        cfi: "epubcfi(/6/2!/4/1:0)",
        progress: 0.2,
        spineItemId: "chapter-1.xhtml",
        textQuote: "Chapter one opening.",
      });

      return {
        applyPreferences: vi.fn(async () => undefined),
        destroy() {
          return undefined;
        },
        findCfiFromTextQuote: vi.fn(async () => null),
        getTextFromCurrentLocation: vi.fn(async () => "Chapter one opening."),
        goTo,
        next: vi.fn(async () => undefined),
        prev: vi.fn(async () => undefined),
        setActiveTtsSegment: vi.fn(async () => undefined),
        setFlow: vi.fn(async () => undefined),
      } as RuntimeRenderHandle;
    }),
  };

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={runtime}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(await screen.findByRole("button", { name: "Chapter 2" }));

  await waitFor(() => {
    expect(goTo).toHaveBeenCalledWith("chapter-2.xhtml");
  });
  expect(runtime.render).toHaveBeenCalledTimes(1);
});

it("renders selection actions in the top bar instead of below the reader stage", () => {
  render(<ReaderPage />);

  const topbar = screen.getByRole("banner");
  expect(within(topbar).getByRole("button", { name: "Translate" })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: "Explain" })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: "Highlight" })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: "Add note" })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  expect(document.querySelector(".reader-stage .selection-popover")).toBeNull();
});

it("renders library import and settings actions inside the reader top bar when shell context is available", async () => {
  const shellContext: ReaderAppShellContext = {
    currentBook: {
      author: "Author",
      progressLabel: "Unread",
      title: "Minimal Valid EPUB",
    },
    isImporting: false,
    isLibraryOpen: false,
    isSettingsOpen: false,
    onImportClick: vi.fn(),
    onLibraryClick: vi.fn(),
    onSettingsClick: vi.fn(),
  };

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route element={<Outlet context={shellContext} />}>
          <Route
            path="/books/:bookId"
            element={
              <ReaderPage
                runtime={{
                  render: vi.fn(async () => ({
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph.\n\nSecond paragraph."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  })),
                }}
              />
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  const topbar = await screen.findByRole("banner");
  expect(within(topbar).getByRole("button", { name: /library/i })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: /import epub/i })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: /settings/i })).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: /reader app navigation/i })).not.toBeInTheDocument();
});

it("turns paginated pages from host-document arrow presses when the reading iframe is focused, while keeping top-bar paging active", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  await db.settings.put(createStoredSettings({
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));
  const nextPage = vi.fn(async () => undefined);
  const prevPage = vi.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ element }) => {
                  const iframe = document.createElement("iframe");
                  iframe.title = "Reader frame";
                  element.appendChild(iframe);

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph.\n\nSecond paragraph."),
                    goTo: vi.fn(async () => undefined),
                    next: nextPage,
                    prev: prevPage,
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /paginated mode/i })).toHaveAttribute("aria-pressed", "true");
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();
  });

  fireEvent.keyDown(document.body, { key: "ArrowRight" });
  fireEvent.keyDown(document.body, { key: "ArrowLeft" });
  expect(nextPage).not.toHaveBeenCalled();
  expect(prevPage).not.toHaveBeenCalled();

  const iframe = document.querySelector(".epub-root iframe");
  expect(iframe).toBeInstanceOf(HTMLIFrameElement);
  (iframe as HTMLIFrameElement).focus();
  expect(document.activeElement).toBe(iframe);

  fireEvent.keyDown(window, { key: "ArrowRight" });
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(nextPage).toHaveBeenCalledTimes(1);
  expect(prevPage).toHaveBeenCalledTimes(1);

  const topbar = screen.getByRole("banner");
  topbar.focus();
  fireEvent.keyDown(topbar, { key: "ArrowRight" });
  fireEvent.keyDown(topbar, { key: "ArrowLeft" });

  expect(nextPage).toHaveBeenCalledTimes(2);
  expect(prevPage).toHaveBeenCalledTimes(2);
});

it("keeps tts queue above appearance and persists voice rate and volume changes from the reader rail", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
    { default: false, lang: "en-US", localService: false, name: "Microsoft Andrew Online (Natural)", voiceURI: "Microsoft Andrew Online (Natural)" },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(async () => "First paragraph.\n\nSecond paragraph."),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  const tools = await screen.findByRole("complementary", { name: /reader tools/i });
  const ttsHeading = within(tools).getByRole("heading", { name: /tts queue/i });
  const appearanceHeading = within(tools).getByRole("heading", { name: /appearance/i });
  expect(ttsHeading.compareDocumentPosition(appearanceHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await user.click(within(tools).getByRole("button", { name: /voice, speed, volume/i }));

  const ttsSettings = within(tools).getByRole("group", { name: /tts settings/i });
  await screen.findByRole("option", { name: /microsoft andrew online/i });
  await user.selectOptions(within(ttsSettings).getByLabelText(/tts voice/i), "Microsoft Andrew Online (Natural)");
  fireEvent.change(within(ttsSettings).getByLabelText(/^tts rate$/i), { target: { value: "1.15" } });
  fireEvent.change(within(ttsSettings).getByLabelText(/tts volume/i), { target: { value: "0.85" } });

  await waitFor(async () => {
    expect(await getSettings()).toMatchObject({
      ttsRate: 1.15,
      ttsVoice: "Microsoft Andrew Online (Natural)",
      ttsVolume: 0.85,
    });
  });
});

it("waits for persisted reader settings before mounting the viewport runtime", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  await db.settings.put(createStoredSettings({
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#c0ffee",
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));
  const renderSpy = vi.fn(async () => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy() {
      return undefined;
    },
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route path="/books/:bookId" element={<ReaderPage runtime={{ render: renderSpy }} />} />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(renderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-1",
        flow: "paginated",
        initialPreferences: expect.objectContaining({
          columnCount: 1,
          contentPadding: 32,
          contentBackgroundColor: "#c0ffee",
          fontFamily: "book",
          fontScale: 1,
          lineHeight: 1.7,
          maxLineWidth: 760,
          readingMode: "paginated",
          theme: "sepia",
        }),
      }),
    );
  });

  expect(document.querySelector(".reader-layout")).toHaveStyle("--reader-page-background: #c0ffee");
});

it("prefers same-tab refresh settings when restoring paginated mode after reload", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  await db.settings.put(createStoredSettings({
    readingMode: "scrolled",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 2,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));
  writeRefreshSettingsSnapshot(createSettingsInput({
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
    columnCount: 2,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    fontFamily: "book",
    fontScale: 1,
    letterSpacing: 0,
    lineHeight: 1.7,
    maxLineWidth: 760,
    paragraphIndent: 1.8,
    paragraphSpacing: 0.85,
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
  }));
  const renderSpy = vi.fn(async () => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy() {
      return undefined;
    },
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route path="/books/:bookId" element={<ReaderPage runtime={{ render: renderSpy }} />} />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(renderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-1",
        flow: "paginated",
        initialPreferences: expect.objectContaining({
          columnCount: 1,
          readingMode: "paginated",
          theme: "sepia",
        }),
      }),
    );
  });
});

it("waits for saved progress before opening the reader and restores the saved cfi", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  await db.settings.put(createStoredSettings({
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));
  let resolveProgress:
    | ((
        value:
          | {
              bookId: string;
              cfi: string;
              pageIndex?: number;
              pageOffset?: number;
              progress: number;
              spineItemId: string;
              textQuote: string;
              updatedAt: number;
            }
          | null,
      ) => void)
    | undefined;
  getProgressMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveProgress = resolve;
    }),
  );
  const renderSpy = vi.fn(async () => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy() {
      return undefined;
    },
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route path="/books/:bookId" element={<ReaderPage runtime={{ render: renderSpy }} />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(renderSpy).not.toHaveBeenCalled();
  expect(screen.getByText(/restoring reading position/i)).toBeInTheDocument();

  await act(async () => {
    resolveProgress?.({
      bookId: "book-1",
      cfi: "epubcfi(/6/2!/4/1:24)",
      pageIndex: 2,
      pageOffset: 1412,
      progress: 0.42,
      spineItemId: "chap-1",
      textQuote: "Morgan’s head was pressed against her pillow.",
      updatedAt: Date.now(),
    });
  });

  await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: "book-1",
          initialCfi: "chap-1",
          initialPageIndex: 2,
          initialPageOffset: 1412,
        }),
      );
  });
});

it("prefers a newer same-tab refresh snapshot over older persisted progress when restoring", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  await db.settings.put(createStoredSettings({
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));
  sessionStorage.setItem(
    "reader-refresh-progress:book-1",
    JSON.stringify({
      bookId: "book-1",
      cfi: "epubcfi(/6/14!/4/2/26/1:193)",
      pageIndex: 2,
      pageOffset: 1732,
      progress: 0.63,
      spineItemId: "chapter-one.xhtml",
      textQuote: "without Eli, the new foster kid",
      updatedAt: 200,
    }),
  );
  getProgressMock.mockResolvedValueOnce({
    bookId: "book-1",
    cfi: "epubcfi(/6/14!/4/2/14/1:37)",
    pageIndex: 1,
    pageOffset: 984,
    progress: 0.51,
    spineItemId: "chapter-one.xhtml",
    textQuote: "sound had been in time with her heartbeat",
    updatedAt: 100,
  });
  const renderSpy = vi.fn(async () => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy() {
      return undefined;
    },
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route path="/books/:bookId" element={<ReaderPage runtime={{ render: renderSpy }} />} />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: "book-1",
          initialCfi: "chapter-one.xhtml",
          initialPageIndex: 2,
          initialPageOffset: 1732,
        }),
      );
  });
});

it("always prefers the same-tab refresh snapshot over persisted progress during reload recovery", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  await db.settings.put(createStoredSettings({
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    targetLanguageCustomized: false,
    theme: "sepia",
    ttsRate: 1,
    ttsVoice: "",
    ttsVolume: 1,
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    paragraphSpacing: 0.85,
    paragraphIndent: 1.8,
    contentPadding: 32,
    contentBackgroundColor: "#f6edde",
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
    llmApiUrl: DEFAULT_TEST_LLM_API_URL,
  }));
  sessionStorage.setItem(
    "reader-refresh-progress:book-1",
    JSON.stringify({
      bookId: "book-1",
      cfi: "epubcfi(/6/14!/4/2/26/1:193)",
      pageIndex: 2,
      pageOffset: 1732,
      progress: 0.63,
      spineItemId: "chapter-one.xhtml",
      textQuote: "without Eli, the new foster kid",
      updatedAt: 100,
    }),
  );
  getProgressMock.mockResolvedValueOnce({
    bookId: "book-1",
    cfi: "epubcfi(/6/14!/4/2/14/1:37)",
    pageIndex: 1,
    pageOffset: 984,
    progress: 0.51,
    spineItemId: "chapter-one.xhtml",
    textQuote: "sound had been in time with her heartbeat",
    updatedAt: 200,
  });
  const renderSpy = vi.fn(async () => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy() {
      return undefined;
    },
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route path="/books/:bookId" element={<ReaderPage runtime={{ render: renderSpy }} />} />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: "book-1",
          initialCfi: "chapter-one.xhtml",
          initialPageIndex: 2,
          initialPageOffset: 1732,
        }),
      );
  });
});

it("shows reader status details in the tools rail instead of below the page surface", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(async () => ""),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  const toolsRail = screen.getByRole("complementary", { name: /reader tools/i });

  await waitFor(() => {
    expect(within(toolsRail).getByText(/opened from chapter start/i)).toBeInTheDocument();
  });

  expect(within(toolsRail).getByText(/0 local annotations in view/i)).toBeInTheDocument();
});

it("writes a same-tab refresh snapshot when the reader location changes", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/14!/4/2/26/1:193)",
                    pageOffset: 1732,
                    progress: 0.63,
                    spineItemId: "chapter-one.xhtml",
                    textQuote: "without Eli, the new foster kid",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => ""),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(JSON.parse(sessionStorage.getItem("reader-refresh-progress:book-1") ?? "null")).toEqual(
      expect.objectContaining({
        cfi: "epubcfi(/6/14!/4/2/26/1:193)",
        pageOffset: 1732,
        progress: 0.63,
        spineItemId: "chapter-one.xhtml",
        textQuote: "without Eli, the new foster kid",
      }),
    );
  });
});

it("flushes the latest runtime location on pagehide even when reader state is stale", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  const getCurrentLocation = vi.fn(async () => ({
    cfi: "epubcfi(/6/14!/4/2/8:24)",
    pageOffset: 1412,
    progress: 0.63,
    spineItemId: "chapter-four.xhtml",
    textQuote: "The thing was, she was so darn comfortable.",
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getCurrentLocation,
                  getTextFromCurrentLocation: vi.fn(async () => "Reader text."),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText(/opened from chapter start/i)).toBeInTheDocument();
  });

  saveProgressMock.mockClear();
  window.dispatchEvent(new Event("pagehide"));

  await waitFor(() => {
    expect(getCurrentLocation).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
      expect(saveProgressMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        cfi: "epubcfi(/6/14!/4/2/8:24)",
        pageOffset: 1412,
        progress: 0.63,
        spineItemId: "chapter-four.xhtml",
        textQuote: "The thing was, she was so darn comfortable.",
      }),
    );
  });
});

it("writes the synchronous paginated viewport snapshot to sessionStorage on pagehide before async runtime recovery completes", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  let resolveLocationChange:
    | ((value: {
        cfi: string;
        pageIndex?: number;
        pageOffset?: number;
        progress: number;
        spineItemId: string;
        textQuote: string;
      }) => void)
    | undefined;
  const getCurrentLocation = vi.fn(
    () =>
      new Promise<{
        cfi: string;
        pageIndex?: number;
        pageOffset?: number;
        progress: number;
        spineItemId: string;
        textQuote: string;
      } | null>(() => undefined),
  );

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  resolveLocationChange = onRelocated;
                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentLocation,
                    getTextFromCurrentLocation: vi.fn(async () => "Reader text."),
                    getViewportLocationSnapshot: vi.fn(() => ({
                      pageIndex: 2,
                      pageOffset: 1732,
                    })),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(resolveLocationChange).toBeTypeOf("function");
  });

  await act(async () => {
    resolveLocationChange?.({
      cfi: "epubcfi(/6/14!/4/2/8:24)",
      pageIndex: 1,
      pageOffset: 913,
      progress: 0.63,
      spineItemId: "chapter-four.xhtml",
      textQuote: "The thing was, she was so darn comfortable.",
    });
  });

  await waitFor(() => {
    expect(JSON.parse(sessionStorage.getItem("reader-refresh-progress:book-1") ?? "null")).toEqual(
      expect.objectContaining({
        pageIndex: 1,
        pageOffset: 913,
      }),
    );
  });

  window.dispatchEvent(new Event("pagehide"));

  await waitFor(() => {
    expect(JSON.parse(sessionStorage.getItem("reader-refresh-progress:book-1") ?? "null")).toEqual(
      expect.objectContaining({
        cfi: "epubcfi(/6/14!/4/2/8:24)",
        pageIndex: 2,
        pageOffset: 1732,
        progress: 0.63,
        spineItemId: "chapter-four.xhtml",
        textQuote: "The thing was, she was so darn comfortable.",
      }),
    );
  });
});

it("writes the synchronous scrolled viewport snapshot scrollTop to sessionStorage on pagehide", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  let resolveLocationChange:
    | ((value: {
        cfi: string;
        pageIndex?: number;
        pageOffset?: number;
        progress: number;
        scrollTop?: number;
        spineItemId: string;
        textQuote: string;
      }) => void)
    | undefined;
  const getCurrentLocation = vi.fn(
    () =>
      new Promise<{
        cfi: string;
        pageIndex?: number;
        pageOffset?: number;
        progress: number;
        scrollTop?: number;
        spineItemId: string;
        textQuote: string;
      } | null>(() => undefined),
  );

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  resolveLocationChange = onRelocated;
                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentLocation,
                    getTextFromCurrentLocation: vi.fn(async () => "Reader text."),
                    getViewportLocationSnapshot: vi.fn(() => ({
                      scrollTop: 13824,
                    })),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(resolveLocationChange).toBeTypeOf("function");
  });

  await act(async () => {
    resolveLocationChange?.({
      cfi: "epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)",
      progress: 0.63,
      spineItemId: "ch004.xhtml",
      textQuote: "10:1 These are the generations of the sons of Noah.",
    });
  });

  window.dispatchEvent(new Event("pagehide"));

  await waitFor(() => {
    expect(JSON.parse(sessionStorage.getItem("reader-refresh-progress:book-1") ?? "null")).toEqual(
      expect.objectContaining({
        cfi: "epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)",
        progress: 0.63,
        scrollTop: 13824,
        spineItemId: "ch004.xhtml",
        textQuote: "10:1 These are the generations of the sons of Noah.",
      }),
    );
  });
});

it("places the tts queue controls above appearance controls in the tools rail", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(async () => "Reader text."),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  const toolsRail = screen.getByRole("complementary", { name: /reader tools/i });
  const headings = within(toolsRail)
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent?.trim());

  expect(headings.indexOf("TTS queue")).toBeLessThan(headings.indexOf("Appearance"));
});

it("switches reading modes and pages through the active rendition", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  const setFlow = vi.fn(async () => undefined);
  const next = vi.fn(async () => undefined);
  const prev = vi.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => ""),
                    goTo: vi.fn(async () => undefined),
                    next,
                    prev,
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow,
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: /paginated mode/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /paginated mode/i })).toHaveAttribute("aria-pressed", "true");
  });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /next page/i }));
  expect(next).toHaveBeenCalled();

  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(prev).not.toHaveBeenCalled();

  const topbar = screen.getByRole("banner");
  topbar.focus();
  fireEvent.keyDown(topbar, { key: "ArrowLeft" });

  await waitFor(() => {
    expect(prev).toHaveBeenCalled();
  });
});

it("applies live appearance changes through the active rendition handle", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  const applyPreferences = vi.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences,
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(async () => ""),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.change(await screen.findByLabelText(/line height/i), {
    target: { value: "2" },
  });

  await waitFor(() => {
    expect(applyPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        lineHeight: 2,
      }),
    );
  });

  fireEvent.change(screen.getByLabelText(/font size/i), {
    target: { value: "1.3" },
  });

  await waitFor(() => {
    expect(applyPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        fontScale: 1.3,
      }),
    );
  });
});

it("persists llm api url changes from the reader tools panel", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(async () => ""),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await act(async () => {
    fireEvent.change(await screen.findByLabelText(/llm api url/i), {
      target: { value: "http://localhost:1234/v1" },
    });
  });

  await waitFor(async () => {
    expect(await getSettings()).toMatchObject({
      llmApiUrl: "http://localhost:1234/v1",
    });
  });
});

it("does not reapply reader preferences when only the reading location changes", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);

  let emitRelocated:
    | ((location: {
        cfi: string;
        pageIndex?: number;
        pageOffset?: number;
        progress: number;
        spineItemId: string;
        textQuote: string;
      }) => void)
    | undefined;
  const applyPreferences = vi.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  emitRelocated = onRelocated;
                  return {
                    applyPreferences,
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph.\n\nSecond paragraph."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(emitRelocated).toBeTypeOf("function");
  });
  await act(async () => {
    await Promise.resolve();
  });
  const initialApplyCount = applyPreferences.mock.calls.length;

  await act(async () => {
    emitRelocated?.({
      cfi: "epubcfi(/6/14!/4/2/8:24)",
      pageIndex: 1,
      pageOffset: 913,
      progress: 0.63,
      spineItemId: "chapter-one.xhtml",
      textQuote: "Morgan’s head was pressed against her pillow.",
    });
  });

  await waitFor(() => {
    expect(saveProgressMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        cfi: "epubcfi(/6/14!/4/2/8:24)",
        pageIndex: 1,
        pageOffset: 913,
      }),
    );
  });

  expect(applyPreferences).toHaveBeenCalledTimes(initialApplyCount);
});

it("keeps pagehide and beforeunload listeners stable when the reader location changes", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);

  let emitRelocated:
    | ((location: {
        cfi: string;
        pageIndex?: number;
        pageOffset?: number;
        progress: number;
        spineItemId: string;
        textQuote: string;
      }) => void)
    | undefined;
  const addEventListenerSpy = vi.spyOn(window, "addEventListener");

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  emitRelocated = onRelocated;
                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph.\n\nSecond paragraph."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(emitRelocated).toBeTypeOf("function");
  });

  const initialPagehideCount = addEventListenerSpy.mock.calls.filter(([type]) => type === "pagehide").length;
  const initialBeforeUnloadCount = addEventListenerSpy.mock.calls.filter(([type]) => type === "beforeunload").length;

  await act(async () => {
    emitRelocated?.({
      cfi: "epubcfi(/6/14!/4/2/8:24)",
      pageIndex: 1,
      pageOffset: 913,
      progress: 0.63,
      spineItemId: "chapter-one.xhtml",
      textQuote: "Morgan’s head was pressed against her pillow.",
    });
  });

  expect(addEventListenerSpy.mock.calls.filter(([type]) => type === "pagehide")).toHaveLength(initialPagehideCount);
  expect(addEventListenerSpy.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(initialBeforeUnloadCount);
});

it("starts pauses resumes and stops continuous reading from the current location", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(
                    async () =>
                      "First short paragraph for the opening segment keeps the first response tight and responsive for the listener.\n\nSecond short paragraph stays with the first so Kokoro can begin faster without turning every sentence into its own request.\n\nThird paragraph becomes the next queued segment for continuous reading once the opening audio is already playing in the reader.",
                  ),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "First short paragraph for the opening segment keeps the first response tight and responsive for the listener. Second short paragraph stays with the first so Kokoro can begin faster without turning every sentence into its own request.",
      }),
    );
  });

  const ttsQueue = screen.getByRole("region", { name: /tts queue/i });
  expect(await within(ttsQueue).findByText(/^playing$/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /pause tts/i }));
  expect(browserTts.speechSynthesis.pause).toHaveBeenCalledTimes(1);
  expect(within(ttsQueue).getByText(/^paused$/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /resume tts/i }));
  expect(browserTts.speechSynthesis.resume).toHaveBeenCalledTimes(1);

  browserTts.finishCurrent();

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Third paragraph becomes the next queued segment for continuous reading once the opening audio is already playing in the reader.",
      }),
    );
  });

  await user.click(screen.getByRole("button", { name: /stop tts/i }));
  expect(browserTts.speechSynthesis.cancel).toHaveBeenCalled();
  expect(within(ttsQueue).getByText(/^ready$/i, { selector: ".reader-tts-badge" })).toBeInTheDocument();
});

it("tracks the active continuous tts segment for viewport highlighting", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const setActiveTtsSegment = vi.fn<(segment: ActiveTtsSegment | null) => Promise<void>>(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph.\n\nSecond paragraph."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment,
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & {
                    setActiveTtsSegment: typeof setActiveTtsSegment;
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  const ttsQueue = screen.getByRole("region", { name: /tts queue/i });
  await waitFor(() => {
    expect(within(ttsQueue).getByText(/first paragraph/i)).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(setActiveTtsSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        endOffset: 5,
        spineItemId: "chap-1",
        startOffset: 0,
        text: "First",
      }),
    );
  });
});

it("restarts continuous reading immediately when the tts rate changes", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph for continuous reading.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph for continuous reading. Second paragraph keeps the queue running.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph for continuous reading.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        rate: 1,
        text: expect.stringContaining("First paragraph for continuous reading."),
      }),
    );
  });

  await user.click(screen.getByRole("button", { name: /voice, speed, volume/i }));
  await user.click(screen.getByRole("button", { name: /1.4x/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.cancel).toHaveBeenCalled();
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rate: 1.4,
        text: expect.stringContaining("First paragraph for continuous reading."),
      }),
    );
  });
});

it("keeps paginated continuous reading on runtime-managed highlighting instead of forcing reader-level goTo", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const goTo = vi.fn(async () => undefined);
  const firstParagraph = "First paragraph keeps the first page active.";
  const secondParagraph = "Second paragraph should move the rendition to the next page.";

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: firstParagraph,
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => `${firstParagraph}\n\n${secondParagraph}`),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: firstParagraph,
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: secondParagraph,
                      },
                    ]),
                    goTo,
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole("button", { name: /paginated mode/i }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: firstParagraph,
      }),
    );
  });

  act(() => {
    browserTts.finishCurrent();
  });

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: secondParagraph,
      }),
    );
  });

  act(() => {
    browserTts.emitBoundary(0);
  });

  await waitFor(() => {
    expect(goTo).not.toHaveBeenCalled();
  });
});

it("continues continuous reading into the next chapter after the current chapter finishes", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  const firstChapterParagraph = "First chapter closes with one final paragraph.";
  const secondChapterParagraph = "Second chapter should begin speaking immediately after the turn.";
  let activeChapter = 1;

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  const relocate = (chapter: number) => {
                    const isFirstChapter = chapter === 1;
                    onRelocated?.({
                      cfi: isFirstChapter ? "epubcfi(/6/2!/4/1:0)" : "epubcfi(/6/4!/4/1:0)",
                      progress: isFirstChapter ? 0.35 : 0.52,
                      spineItemId: isFirstChapter ? "chap-1" : "chap-2",
                      textQuote: isFirstChapter ? firstChapterParagraph : secondChapterParagraph,
                    });
                  };

                  relocate(activeChapter);

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentLocation: vi.fn(async () => ({
                      cfi: activeChapter === 1 ? "epubcfi(/6/2!/4/1:0)" : "epubcfi(/6/4!/4/1:0)",
                      progress: activeChapter === 1 ? 0.35 : 0.52,
                      spineItemId: activeChapter === 1 ? "chap-1" : "chap-2",
                      textQuote: activeChapter === 1 ? firstChapterParagraph : secondChapterParagraph,
                    })),
                    getTextFromCurrentLocation: vi.fn(async () =>
                      activeChapter === 1 ? firstChapterParagraph : secondChapterParagraph,
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () =>
                      activeChapter === 1
                        ? [
                            {
                              cfi: "epubcfi(/6/2!/4/2/1:0)",
                              spineItemId: "chap-1",
                              text: firstChapterParagraph,
                            },
                          ]
                        : [
                            {
                              cfi: "epubcfi(/6/4!/4/2/1:0)",
                              spineItemId: "chap-2",
                              text: secondChapterParagraph,
                            },
                          ],
                    ),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => {
                      activeChapter = 2;
                      relocate(activeChapter);
                    }),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: firstChapterParagraph,
      }),
    );
  });

  act(() => {
    browserTts.finishCurrent();
  });

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: secondChapterParagraph,
      }),
    );
  });
});

it("flushes the latest reading location before page refresh", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/8/1:12)",
                    progress: 0.48,
                    spineItemId: "chapter-one.xhtml",
                    textQuote: "Morgan’s head was pressed against her pillow.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentLocation: vi.fn(async () => ({
                      cfi: "epubcfi(/6/2!/4/8/1:12)",
                      progress: 0.48,
                      spineItemId: "chapter-one.xhtml",
                      textQuote: "Morgan’s head was pressed against her pillow.",
                    })),
                    getTextFromCurrentLocation: vi.fn(async () => "Morgan’s head was pressed against her pillow."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(saveProgressMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        cfi: "epubcfi(/6/2!/4/8/1:12)",
        progress: 0.48,
        spineItemId: "chapter-one.xhtml",
        textQuote: "Morgan’s head was pressed against her pillow.",
      }),
    );
  });

  saveProgressMock.mockClear();
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });

  await waitFor(() => {
    expect(saveProgressMock).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        cfi: "epubcfi(/6/2!/4/8/1:12)",
        progress: 0.48,
        spineItemId: "chapter-one.xhtml",
        textQuote: "Morgan’s head was pressed against her pillow.",
      }),
    );
  });
});

it("moves the active viewport marker when boundary events advance into the next paragraph", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const setActiveTtsSegment = vi.fn<(segment: ActiveTtsSegment | null) => Promise<void>>(async () => undefined);
  const chapterText =
    "First paragraph keeps the marker at the opening position.\n\nSecond paragraph should take over the marker after the boundary crosses into it.";

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => chapterText),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment,
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & {
                    setActiveTtsSegment: typeof setActiveTtsSegment;
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(setActiveTtsSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        endOffset: 5,
        startOffset: 0,
        text: "First",
      }),
    );
  });

  act(() => {
    browserTts.emitBoundary(chapterText.indexOf("Second paragraph"));
  });

  await waitFor(() => {
    const lastCall = setActiveTtsSegment.mock.calls.at(-1)?.[0];
    expect(lastCall).toEqual(
      expect.objectContaining({
        text: "Second",
      }),
    );
  });
});

it("prefers paragraph tts blocks over flattened chapter text when choosing the initial marker", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const setActiveTtsSegment = vi.fn<(segment: ActiveTtsSegment | null) => Promise<void>>(async () => undefined);
  const flattenedText =
    "ONE Morgan’s head was pressed against her pillow. The alarm on her phone had just been snoozed again. The thing was, she was so darn comfortable.";
  const paragraphBlocks = [
    "Morgan’s head was pressed against her pillow. The alarm on her phone had just been snoozed again.",
    "The thing was, she was so darn comfortable.",
  ];

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => flattenedText),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () =>
                      paragraphBlocks.map((text) => ({
                        spineItemId: "chap-1",
                        text,
                      })),
                    ),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment,
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & {
                    getTtsBlocksFromCurrentLocation: () => Promise<Array<{ spineItemId: string; text: string }>>;
                    setActiveTtsSegment: typeof setActiveTtsSegment;
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(setActiveTtsSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        text: paragraphBlocks[0].split(/\s+/)[0],
      }),
    );
  });

  const firstMarker = setActiveTtsSegment.mock.calls.find((call) => call[0])?.[0];
  expect(firstMarker).toEqual(
    expect.objectContaining({
      text: paragraphBlocks[0].split(/\s+/)[0],
    }),
  );
  expect(firstMarker?.text.startsWith("ONE")).toBe(false);
});

it("starts continuous reading from the first word of the current selection when the visible page has a selection", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph on the current page.\n\nSecond paragraph keeps the queue running after the selected opening words.\n\nThird paragraph keeps the queue alive after the selected block.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running after the selected opening words.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/6/1:0)",
                        spineItemId: "chap-1",
                        text: "Third paragraph keeps the queue alive after the selected block.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & {
                    getTtsBlocksFromSelectionStart: (cfiRange: string) => Promise<Array<{ cfi?: string; spineItemId: string; text: string }>>;
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "Second paragraph",
    });
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Second paragraph keeps the queue running after the selected opening words. Third paragraph keeps the queue alive after the selected block.",
      }),
    );
  });
});

it("uses the live runtime selection when start tts is pressed before selection state settles", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => ({
                      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
                      isReleased: true,
                      spineItemId: "chap-1",
                      text: "Second paragraph",
                    })),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph on the current page."),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running after the selected opening words.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Second paragraph keeps the queue running after the selected opening words.",
      }),
    );
  });
});

it("prefers the explicit toc navigation target for the first start tts after chapter navigation", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const getTtsBlocksFromTarget = vi.fn(async () => [
    {
      cfi: "epubcfi(/6/2!/4/1:0)",
      spineItemId: "chap-1",
      tagName: "h1",
      text: "1",
    },
    {
      cfi: "epubcfi(/6/2!/4/2:0)",
      spineItemId: "chap-1",
      tagName: "h1",
      text: "THIRD",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated, onTocChange }) => {
                  onTocChange?.([
                    {
                      id: "c01",
                      label: "1. Third",
                      target: "OEBPS/c01.xhtml",
                    },
                  ]);
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/12/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "The monitor lady smiled very nicely and tousled his hair.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () => "The monitor lady smiled very nicely and tousled his hair.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/12/1:0)",
                        spineItemId: "chap-1",
                        text: "The monitor lady smiled very nicely and tousled his hair.",
                      },
                    ]),
                    getTtsBlocksFromTarget,
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & {
                    getTtsBlocksFromTarget: (target: string) => Promise<Array<{ cfi: string; spineItemId: string; tagName?: string; text: string }>>;
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /^1\. third$/i }));
  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(getTtsBlocksFromTarget).toHaveBeenCalledWith("OEBPS/c01.xhtml");
  });
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "1.",
      }),
    );
  });

  browserTts.finishCurrent();

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "THIRD",
      }),
    );
  });
});

it("adds an audible pause after a chapter heading before continuing into the body text", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const getTtsBlocksFromTarget = vi.fn(async () => [
    {
      cfi: "epubcfi(/6/2!/4/4/1:0)",
      spineItemId: "chap-10",
      tagName: "h2",
      text: "Nations Descended from Noah",
    },
    {
      cfi: "epubcfi(/6/2!/4/6/1:0)",
      spineItemId: "chap-10",
      tagName: "p",
      text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated, onTocChange }) => {
                  onTocChange?.([
                    {
                      id: "gen-10",
                      label: "Chapter 10",
                      target: "OEBPS/ch004.xhtml#v01010001",
                    },
                  ]);
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/6/1:0)",
                    progress: 0.18,
                    sectionPath: ["GENESIS", "Chapter 10"],
                    spineItemId: "chap-10",
                    textQuote: "These are the generations of the sons of Noah, Shem, Ham, and Japheth.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () => "These are the generations of the sons of Noah, Shem, Ham, and Japheth.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/6/1:0)",
                        spineItemId: "chap-10",
                        text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth.",
                      },
                    ]),
                    getTtsBlocksFromTarget,
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & {
                    getTtsBlocksFromTarget: (target: string) => Promise<Array<{ cfi: string; spineItemId: string; tagName?: string; text: string }>>;
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /^chapter 10$/i }));
  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(getTtsBlocksFromTarget).toHaveBeenCalledWith("OEBPS/ch004.xhtml#v01010001");
  });
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Nations Descended from Noah.",
      }),
    );
  });

  browserTts.finishCurrent();

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
      }),
    );
  });
});

it("restores the pending toc tts start target after a same-tab refresh", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const getTtsBlocksFromTarget = vi.fn(async () => [
    {
      cfi: "epubcfi(/6/2!/4/1:0)",
      spineItemId: "chap-1",
      tagName: "h1",
      text: "1",
    },
    {
      cfi: "epubcfi(/6/2!/4/2:0)",
      spineItemId: "chap-1",
      tagName: "h1",
      text: "THIRD",
    },
  ]);

  const renderReader = () =>
    render(
      <MemoryRouter initialEntries={["/books/book-1"]}>
        <Routes>
          <Route
            path="/books/:bookId"
            element={
              <ReaderPage
                runtime={{
                  render: vi.fn(async ({ onRelocated, onTocChange }) => {
                    onTocChange?.([
                      {
                        id: "c01",
                        label: "1. Third",
                        target: "OEBPS/c01.xhtml",
                      },
                    ]);
                    onRelocated?.({
                      cfi: "epubcfi(/6/2!/4/12/1:0)",
                      progress: 0.2,
                      spineItemId: "chap-1",
                      textQuote: "The monitor lady smiled very nicely and tousled his hair.",
                    });

                    return {
                      applyPreferences: vi.fn(async () => undefined),
                      destroy() {
                        return undefined;
                      },
                      findCfiFromTextQuote: vi.fn(async () => null),
                      getTextFromCurrentLocation: vi.fn(
                        async () => "The monitor lady smiled very nicely and tousled his hair.",
                      ),
                      getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                        {
                          cfi: "epubcfi(/6/2!/4/12/1:0)",
                          spineItemId: "chap-1",
                          text: "The monitor lady smiled very nicely and tousled his hair.",
                        },
                      ]),
                      getTtsBlocksFromTarget,
                      goTo: vi.fn(async () => undefined),
                      next: vi.fn(async () => undefined),
                      prev: vi.fn(async () => undefined),
                      setActiveTtsSegment: vi.fn(async () => undefined),
                      setFlow: vi.fn(async () => undefined),
                    } as RuntimeRenderHandle & {
                      getTtsBlocksFromTarget: (target: string) => Promise<Array<{ cfi: string; spineItemId: string; tagName?: string; text: string }>>;
                    };
                  }),
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

  const firstMount = renderReader();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });
  await user.click(screen.getByRole("button", { name: /^1\. third$/i }));
  firstMount.unmount();

  renderReader();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });
  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(getTtsBlocksFromTarget).toHaveBeenCalledWith("OEBPS/c01.xhtml");
  });
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "1.",
      }),
    );
  });

  browserTts.finishCurrent();

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "THIRD",
      }),
    );
  });
});

it("clears the active selection after start tts while continuing from the selection start", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const clearSelection = vi.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection,
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => ({
                      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
                      isReleased: true,
                      spineItemId: "chap-1",
                      text: "Second paragraph",
                    })),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph on the current page.\n\nSecond paragraph keeps the queue running after the selected opening words.\n\nThird paragraph keeps the queue alive after the selected block.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running after the selected opening words.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/6/1:0)",
                        spineItemId: "chap-1",
                        text: "Third paragraph keeps the queue alive after the selected block.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle & { clearSelection: () => Promise<void> };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "Second paragraph",
    });
  });

  expect(selectionBridge.read()).toEqual(
    expect.objectContaining({
      text: "Second paragraph",
    }),
  );

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Second paragraph keeps the queue running after the selected opening words. Third paragraph keeps the queue alive after the selected block.",
      }),
    );
  });

  expect(clearSelection).toHaveBeenCalledTimes(1);
  expect(selectionBridge.read()).toBeNull();
});

it("preserves the released selection when start tts is pressed and the iframe selection collapses on pointer down", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph on the current page.\n\nSecond paragraph keeps the queue running after the selected opening words.\n\nThird paragraph keeps the queue alive after the selected block.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running after the selected opening words.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/6/1:0)",
                        spineItemId: "chap-1",
                        text: "Third paragraph keeps the queue alive after the selected block.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "Second paragraph",
    });
  });

  const startButton = screen.getByRole("button", { name: /start tts/i });
  fireEvent.mouseDown(startButton);
  act(() => {
    selectionBridge.publish(null);
  });
  fireEvent.click(startButton);

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Second paragraph keeps the queue running after the selected opening words. Third paragraph keeps the queue alive after the selected block.",
      }),
    );
  });
});

it("captures the live iframe selection on start tts pointer down before bridge state exists", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => null),
                    getCurrentSelectionSnapshot: vi.fn(() => ({
                      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
                      isReleased: true,
                      spineItemId: "chap-1",
                      text: "Second paragraph",
                    })),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph on the current page.\n\nSecond paragraph keeps the queue running after the selected opening words.\n\nThird paragraph keeps the queue alive after the selected block.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running after the selected opening words.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/6/1:0)",
                        spineItemId: "chap-1",
                        text: "Third paragraph keeps the queue alive after the selected block.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  const startButton = screen.getByRole("button", { name: /start tts/i });
  fireEvent.mouseDown(startButton);
  fireEvent.click(startButton);

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalled();
  });

  const speakMock = browserTts.speechSynthesis.speak as unknown as {
    mock: { calls: Array<[SpeechSynthesisUtterance]> };
  };
  const spokenTexts = speakMock.mock.calls.map(([utterance]) => utterance.text);
  expect(spokenTexts[0]).toMatch(/^Second paragraph/);
  expect(spokenTexts.join(" ")).toContain("Third paragraph keeps the queue alive after the selected block.");
});

it("falls back to the most recent released selection when focus clearing already wiped the bridge before start tts", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => null),
                    getCurrentSelectionSnapshot: vi.fn(() => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph on the current page.\n\nSecond paragraph keeps the queue running after the selected opening words.\n\nThird paragraph keeps the queue alive after the selected block.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running after the selected opening words.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/6/1:0)",
                        spineItemId: "chap-1",
                        text: "Third paragraph keeps the queue alive after the selected block.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "Second paragraph",
    });
  });
  act(() => {
    selectionBridge.publish(null);
  });

  const startButton = screen.getByRole("button", { name: /start tts/i });
  fireEvent.mouseDown(startButton);
  fireEvent.click(startButton);

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Second paragraph keeps the queue running after the selected opening words. Third paragraph keeps the queue alive after the selected block.",
      }),
    );
  });
});

it("falls back to the most recent non-empty selection even if the iframe never published a released snapshot", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => null),
                    getCurrentSelectionSnapshot: vi.fn(() => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph on the current page.\n\nSecond paragraph keeps the queue running after the selected opening words.\n\nThird paragraph keeps the queue alive after the selected block.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/4/1:0)",
                        spineItemId: "chap-1",
                        text: "Second paragraph keeps the queue running after the selected opening words.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/6/1:0)",
                        spineItemId: "chap-1",
                        text: "Third paragraph keeps the queue alive after the selected block.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/4,/1:0,/1:18)",
      isReleased: false,
      spineItemId: "chap-1",
      text: "Second paragraph",
    });
  });
  act(() => {
    selectionBridge.publish(null);
  });

  const startButton = screen.getByRole("button", { name: /start tts/i });
  fireEvent.mouseDown(startButton);
  fireEvent.click(startButton);

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Second paragraph keeps the queue running after the selected opening words. Third paragraph keeps the queue alive after the selected block.",
      }),
    );
  });
});

it("prefers cfi-backed continuous selection chunks over exact selection snapshot blocks", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/18/1:0)",
                    progress: 0.12,
                    spineItemId: "chap-9",
                    textQuote: "All the days of Noah were 950 years, and he died.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => null),
                    getCurrentSelectionSnapshot: vi.fn(() => null),
                    getTextFromCurrentLocation: vi.fn(async () => "All the days of Noah were 950 years, and he died."),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/18/1:0)",
                        spineItemId: "chap-9",
                        text: "All the days of Noah were 950 years, and he died.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/18/1:37)",
                        locatorText: "All the days of Noah were 950 years, and he died.",
                        sourceEnd: 49,
                        sourceStart: 37,
                        spineItemId: "chap-9",
                        text: "and he died.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/20/1:0)",
                        spineItemId: "chap-10",
                        tagName: "h2",
                        text: "Nations Descended from Noah",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/22/1:0)",
                        spineItemId: "chap-10",
                        text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/18,/1:37,/1:49)",
      isReleased: false,
      spineItemId: "chap-9",
      text: "and he died.",
      ttsBlocks: [
        {
          cfi: "epubcfi(/6/2!/4/18/1:37)",
          spineItemId: "chap-9",
          text: "and he died.",
        },
      ],
    });
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: "and he died.",
      }),
    );
  });

  browserTts.finishCurrent();

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: "Nations Descended from Noah.",
      }),
    );
  });
});

it("keeps a chapter-heading pause when selection-start tts crosses into the next chapter", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/18/1:0)",
                    progress: 0.12,
                    sectionPath: ["GENESIS", "Chapter 9"],
                    spineItemId: "chap-9",
                    textQuote: "All the days of Noah were 950 years, and he died.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => ({
                      cfiRange: "epubcfi(/6/2!/4/18,/1:37,/1:49)",
                      isReleased: true,
                      spineItemId: "chap-9",
                      text: "and he died.",
                    })),
                    getTextFromCurrentLocation: vi.fn(async () => "All the days of Noah were 950 years, and he died."),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/18/1:0)",
                        spineItemId: "chap-9",
                        text: "All the days of Noah were 950 years, and he died.",
                      },
                    ]),
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/18/1:37)",
                        locatorText: "All the days of Noah were 950 years, and he died.",
                        sourceEnd: 49,
                        sourceStart: 37,
                        spineItemId: "chap-9",
                        text: "and he died.",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/20/1:0)",
                        spineItemId: "chap-10",
                        tagName: "h2",
                        text: "Nations Descended from Noah",
                      },
                      {
                        cfi: "epubcfi(/6/2!/4/22/1:0)",
                        spineItemId: "chap-10",
                        text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: "and he died.",
      }),
    );
  });

  browserTts.finishCurrent();

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: "Nations Descended from Noah.",
      }),
    );
  });

  browserTts.finishCurrent();
  await new Promise((resolve) => setTimeout(resolve, 220));
  expect(browserTts.speechSynthesis.speak).toHaveBeenCalledTimes(2);

  await new Promise((resolve) => setTimeout(resolve, 130));
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
      }),
    );
  });
});

it("starts continuous tts from a pointer-down selection block snapshot even when no cfi-backed selection survives", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  const getTtsBlocksFromCurrentSelection = vi.fn(async () => [
    {
      cfi: "epubcfi(/6/2!/4/4/1:18)",
      spineItemId: "chap-1",
      text: "selected opening words. Third paragraph keeps the queue alive after the selected block.",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                    textQuote: "First paragraph on the current page.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => null),
                    getCurrentSelectionSnapshot: vi.fn(() => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "First paragraph on the current page.\n\nSecond paragraph keeps the queue running after the selected opening words.\n\nThird paragraph keeps the queue alive after the selected block.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-1",
                        text: "First paragraph on the current page.",
                      },
                    ]),
                    getTtsBlocksFromCurrentSelection,
                    getTtsBlocksFromSelectionStart: vi.fn(async () => []),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  const startButton = screen.getByRole("button", { name: /start tts/i });
  fireEvent.mouseDown(startButton);
  fireEvent.click(startButton);

  await waitFor(() => {
    expect(getTtsBlocksFromCurrentSelection).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "selected opening words. Third paragraph keeps the queue alive after the selected block.",
      }),
    );
  });
});

it("reuses the cached live selection blocks when a later cfi fallback would jump back to chapter start", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  const getTtsBlocksFromCurrentSelection = vi
    .fn<NonNullable<RuntimeRenderHandle["getTtsBlocksFromCurrentSelection"]>>()
    .mockResolvedValueOnce([
      {
        cfi: "epubcfi(/6/2!/4/20/1:24)",
        spineItemId: "chap-10",
        text: "the sons of Noah, and from these the people of the whole earth were dispersed. The sons of Japheth were Gomer, Magog, Madai, Javan, Tubal, Meshech, and Tiras.",
      },
    ])
    .mockResolvedValue([]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-10",
                    textQuote: "These are the generations of the sons of Noah.",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    clearSelection: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getCurrentSelection: vi.fn(async () => null),
                    getCurrentSelectionSnapshot: vi.fn(() => null),
                    getTextFromCurrentLocation: vi.fn(
                      async () =>
                        "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
                    ),
                    getTtsBlocksFromCurrentLocation: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-10",
                        text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
                      },
                    ]),
                    getTtsBlocksFromCurrentSelection,
                    getTtsBlocksFromSelectionStart: vi.fn(async () => [
                      {
                        cfi: "epubcfi(/6/2!/4/2/1:0)",
                        spineItemId: "chap-10",
                        text: "These are the generations of the sons of Noah, Shem, Ham, and Japheth. Sons were born to them after the flood.",
                      },
                    ]),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  } as RuntimeRenderHandle;
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/20,/1:24,/1:41)",
      isReleased: true,
      spineItemId: "chap-10",
      text: "the sons of Noah",
    });
  });

  await waitFor(() => {
    expect(getTtsBlocksFromCurrentSelection).toHaveBeenCalledTimes(1);
  });

  act(() => {
    selectionBridge.publish(null);
  });

  const startButton = screen.getByRole("button", { name: /start tts/i });
  fireEvent.mouseDown(startButton);
  fireEvent.click(startButton);

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "the sons of Noah, and from these the people of the whole earth were dispersed. The sons of Japheth were Gomer, Magog, Madai, Javan, Tubal, Meshech, and Tiras.",
      }),
    );
  });
});

it("persistently updates tts rate from the quick control", async () => {
  const user = userEvent.setup();
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated }) => {
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.2,
                    spineItemId: "chap-1",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
                    findCfiFromTextQuote: vi.fn(async () => null),
                    getTextFromCurrentLocation: vi.fn(async () => "First paragraph only."),
                    goTo: vi.fn(async () => undefined),
                    next: vi.fn(async () => undefined),
                    prev: vi.fn(async () => undefined),
                    setActiveTtsSegment: vi.fn(async () => undefined),
                    setFlow: vi.fn(async () => undefined),
                  };
                }),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: /voice, speed, volume/i }));
  await user.click(screen.getByRole("button", { name: /1.2x/i }));

  await expect(getSettings()).resolves.toMatchObject({
    ttsRate: 1.2,
  });

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        rate: 1.2,
      }),
    );
  });
});

it("keeps start tts disabled until the reading surface is ready", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  let resolveRender: ((value: RuntimeRenderHandle) => void) | undefined;

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(
                  () =>
                    new Promise<RuntimeRenderHandle>((resolve) => {
                      resolveRender = resolve;
                    }),
                ),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole("button", { name: /start tts/i })).toBeDisabled();

  await waitFor(() => {
    expect(resolveRender).toBeTypeOf("function");
  });

  await act(async () => {
    resolveRender?.({
      applyPreferences: async () => undefined,
      destroy: () => undefined,
      findCfiFromTextQuote: async () => null,
      getTextFromCurrentLocation: async () => "Ready text",
      goTo: async () => undefined,
      next: async () => undefined,
      prev: async () => undefined,
      setActiveTtsSegment: async () => undefined,
      setFlow: async () => undefined,
    });
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });
});

it("keeps start tts disabled when the current location has no readable text yet", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  const renderRuntime = vi.fn(async (): Promise<RuntimeRenderHandle> => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy: () => undefined,
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: renderRuntime,
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(renderRuntime).toHaveBeenCalled();
  });

  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(screen.getByRole("button", { name: /start tts/i })).toBeDisabled();
});

it("falls back to flattened chapter text when paragraph tts blocks cannot be extracted", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  const renderRuntime = vi.fn(async (): Promise<RuntimeRenderHandle> => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy: () => undefined,
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => "Fallback reader text stays speakable."),
    getTtsBlocksFromCurrentLocation: vi.fn(async () => {
      throw new Error("tts block extraction failed");
    }),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  }));

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: renderRuntime,
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });
});

it("allows continuous tts in chrome when browser speech synthesis and english voices are available", async () => {
  setUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Google US English", voiceURI: "Google US English" },
  ]);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(async () => "Ready text for Kokoro."),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });
  expect(screen.queryByText(/optimized for microsoft edge on desktop/i)).not.toBeInTheDocument();
});

it("still disables continuous tts when browser speech synthesis is unavailable", async () => {
  setUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/123.0");
  vi.stubGlobal("speechSynthesis", undefined);

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  findCfiFromTextQuote: vi.fn(async () => null),
                  getTextFromCurrentLocation: vi.fn(async () => "Ready text for browser speech."),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setActiveTtsSegment: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText(/browser speech synthesis unavailable/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /start tts/i })).toBeDisabled();
});
