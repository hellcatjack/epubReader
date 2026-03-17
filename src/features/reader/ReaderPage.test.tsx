import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import { db, resetDb } from "../../lib/db/appDb";
import { getSettings } from "../settings/settingsRepository";
import { writeRefreshSettingsSnapshot } from "../settings/refreshSettingsSnapshot";
import type { ActiveTtsSegment, RuntimeRenderHandle } from "./epubRuntime";
import { ReaderPage } from "./ReaderPage";

const getProgressMock = vi.fn().mockResolvedValue(null);
const saveProgressMock = vi.fn().mockResolvedValue(undefined);

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
  vi.unstubAllGlobals();
  getProgressMock.mockReset();
  getProgressMock.mockResolvedValue(null);
  saveProgressMock.mockReset();
  saveProgressMock.mockResolvedValue(undefined);
  sessionStorage.clear();
  await resetDb();
});

function setUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
}

function installSpeechSynthesis(voices: SpeechSynthesisVoice[]) {
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
    }),
    speaking: false,
  } as unknown as SpeechSynthesis;

  vi.stubGlobal("speechSynthesis", speechSynthesis);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
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
    finishCurrent() {
      currentUtterance?.onend?.(new Event("end") as SpeechSynthesisEvent);
    },
    speechSynthesis,
  };
}

it("shows toc, reading progress, bookmark toggle, and the reader tools surface", () => {
  render(<ReaderPage />);

  expect(screen.getByRole("navigation", { name: /table of contents/i })).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: /reading progress/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bookmark this location/i })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: /reader tools/i })).toBeInTheDocument();
});

it("waits for persisted reader settings before mounting the viewport runtime", async () => {
  setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0");
  installSpeechSynthesis([
    { default: true, lang: "en-US", localService: false, name: "Microsoft Ava Online (Natural)", voiceURI: "Microsoft Ava Online (Natural)" },
  ]);
  await db.settings.put({
    id: "settings",
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
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
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
        flow: "paginated",
        initialPreferences: expect.objectContaining({
          columnCount: 1,
          contentPadding: 32,
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
  await db.settings.put({
    id: "settings",
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
    maxLineWidth: 760,
    columnCount: 2,
    fontFamily: "book",
    apiKey: "",
  });
  writeRefreshSettingsSnapshot({
    apiKey: "",
    columnCount: 2,
    contentPadding: 32,
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
  await db.settings.put({
    id: "settings",
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
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
  });
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
  await db.settings.put({
    id: "settings",
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
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
  });
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
  await db.settings.put({
    id: "settings",
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
    maxLineWidth: 760,
    columnCount: 1,
    fontFamily: "book",
    apiKey: "",
  });
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

  await user.click(screen.getByRole("button", { name: /next page/i }));
  expect(next).toHaveBeenCalled();

  fireEvent.keyDown(window, { key: "ArrowLeft" });

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

  expect(await screen.findByText(/playing/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /pause tts/i }));
  expect(browserTts.speechSynthesis.pause).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/paused/i)).toBeInTheDocument();

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
  expect(screen.getByText(/idle/i)).toBeInTheDocument();
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

  await waitFor(() => {
    expect(screen.getByText(/current: first paragraph/i)).toBeInTheDocument();
  });

  expect(setActiveTtsSegment).toHaveBeenCalledWith(
    expect.objectContaining({
      spineItemId: "chap-1",
      text: expect.stringContaining("First paragraph"),
    }),
  );
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

it("auto-turns pages during continuous reading in paginated mode", async () => {
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
  const chunkText = `${firstParagraph} ${secondParagraph}`;

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
                    getTextFromCurrentLocation: vi.fn(async () => chunkText),
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

  act(() => {
    browserTts.emitBoundary(chunkText.indexOf(secondParagraph));
  });

  await waitFor(() => {
    expect(goTo).toHaveBeenCalledWith("epubcfi(/6/2!/4/4/1:0)");
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
  window.dispatchEvent(new Event("pagehide"));

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
        text: expect.stringContaining("First paragraph"),
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
        text: expect.stringMatching(/^Second paragraph/),
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
        text: paragraphBlocks[0],
      }),
    );
  });

  const firstMarker = setActiveTtsSegment.mock.calls.find((call) => call[0])?.[0];
  expect(firstMarker).toEqual(
    expect.objectContaining({
      text: paragraphBlocks[0],
    }),
  );
  expect(firstMarker?.text.startsWith("ONE")).toBe(false);
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

it("shows an explicit edge support warning when browser tts is unsupported", async () => {
  setUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/123.0");

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

  expect(await screen.findByText(/optimized for microsoft edge on desktop/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /start tts/i })).toBeDisabled();
});
