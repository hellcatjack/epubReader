import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { db, resetDb } from "../../lib/db/appDb";
import { saveSettings } from "../settings/settingsRepository";
import { ReaderPage } from "./ReaderPage";
import { selectionBridge } from "./selectionBridge";

const originalUserAgent = window.navigator.userAgent;

afterEach(async () => {
  act(() => {
    selectionBridge.publish(null);
  });
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: originalUserAgent,
  });
  vi.unstubAllGlobals();
  await resetDb();
});

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
    finishCurrent() {
      currentUtterance?.onend?.(new Event("end") as SpeechSynthesisEvent);
    },
    speechSynthesis,
  };
}

function installEdgeDesktopUserAgent() {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/123.0",
  });
}

it("automatically translates and auto-reads a new selection while keeping explain and note actions available", async () => {
  const user = userEvent.setup();
  installEdgeDesktopUserAgent();
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    translateSelection: vi.fn(async () => "你好，世界"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", spineItemId: "chap-1", text: "Hello world" });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledWith(
      "Hello world",
      expect.objectContaining({ targetLanguage: "zh-CN" }),
    );
  });
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
  expect(await screen.findByText("你好，世界")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /explain/i }));
  expect(ai.explainSelection).toHaveBeenCalledWith(
    "Hello world",
    expect.objectContaining({ targetLanguage: "zh-CN" }),
  );
  expect(await screen.findByText("A short contextual explanation")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /add note/i }));
  expect(screen.getByRole("textbox", { name: /note body/i })).toBeInTheDocument();
  expect(screen.getAllByText(/hello world/i).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /read aloud/i })).toBeInTheDocument();
});

it("does not auto-read punctuation-only selections", async () => {
  installEdgeDesktopUserAgent();
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const ai = {
    translateSelection: vi.fn(async () => "…"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", spineItemId: "chap-1", text: "..." });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledTimes(1);
  });

  expect(browserTts.speechSynthesis.speak).not.toHaveBeenCalled();
});

it("reads aloud the selected text through browser speech synthesis", async () => {
  const user = userEvent.setup();
  installEdgeDesktopUserAgent();
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);

  render(<ReaderPage />);

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", spineItemId: "chap-1", text: "Hello world" });
  });

  await user.click(screen.getByRole("button", { name: /read aloud/i }));

  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledTimes(2);
  });

  act(() => {
    browserTts.finishCurrent();
  });

  await waitFor(() => {
    expect(screen.getByText(/tts status: idle/i)).toBeInTheDocument();
  });
});

it("does not auto-translate the same selection twice until the selection is cleared", async () => {
  const ai = {
    translateSelection: vi.fn(async () => "你好，世界"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => {
      throw new Error("unsupported");
    }),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", spineItemId: "chap-1", text: "Hello world" });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledTimes(1);
  });

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", spineItemId: "chap-1", text: "Hello world" });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledTimes(1);
  });

  act(() => {
    selectionBridge.publish(null);
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", spineItemId: "chap-1", text: "Hello world" });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledTimes(2);
  });
});

it("stores local highlight and note entries for the active selection", async () => {
  const user = userEvent.setup();

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

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      spineItemId: "chap-1",
      text: "Hello world",
    });
  });

  await user.click(screen.getByRole("button", { name: /highlight/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/saved highlights/i)).toHaveTextContent("Hello world");
  });

  await user.click(screen.getByRole("button", { name: /add note/i }));
  await user.type(screen.getByRole("textbox", { name: /note body/i }), "Remember this line");
  await user.click(screen.getByRole("button", { name: /save note/i }));

  await waitFor(() => {
    expect(screen.getByLabelText(/saved notes/i)).toHaveTextContent("Remember this line");
  });
});

it("removes a saved highlight from the current chapter", async () => {
  const user = userEvent.setup();

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

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      spineItemId: "chap-1",
      text: "Hello world",
    });
  });

  await user.click(screen.getByRole("button", { name: /highlight/i }));

  await waitFor(() => {
    expect(screen.getByLabelText(/saved highlights/i)).toHaveTextContent("Hello world");
  });

  await user.click(screen.getByRole("button", { name: /remove highlight hello world/i }));

  await waitFor(() => {
    expect(screen.getByLabelText(/saved highlights/i)).not.toHaveTextContent("Hello world");
  });
});

it("uses the persisted target language setting for AI actions", async () => {
  const user = userEvent.setup();
  const ai = {
    translateSelection: vi.fn(async () => "你好"),
    explainSelection: vi.fn(async () => "解释"),
    synthesizeSpeech: vi.fn(async () => {
      throw new Error("unsupported");
    }),
  };

  await saveSettings({
    apiKey: "",
    targetLanguage: "zh-CN",
    theme: "sepia",
    ttsVoice: "disabled",
    fontScale: 1,
  });

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ text: "Hello world" });
  });

  await user.click(screen.getByRole("button", { name: /translate/i }));

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledWith(
      "Hello world",
      expect.objectContaining({ targetLanguage: "zh-CN" }),
    );
  });
});

it("migrates legacy english defaults to chinese for translation requests", async () => {
  const user = userEvent.setup();
  const ai = {
    translateSelection: vi.fn(async () => "你好"),
    explainSelection: vi.fn(async () => "中文解释\nEnglish explanation"),
    synthesizeSpeech: vi.fn(async () => {
      throw new Error("unsupported");
    }),
  };

  await db.settings.put({
    id: "settings",
    apiKey: "",
    targetLanguage: "en",
    theme: "sepia",
    ttsVoice: "disabled",
    fontScale: 1,
  } as never);

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ text: "Hello world" });
  });

  await user.click(screen.getByRole("button", { name: /translate/i }));

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledWith(
      "Hello world",
      expect.objectContaining({ targetLanguage: "zh-CN" }),
    );
  });
});

it("updates reading progress and toggles a bookmark for the current location", async () => {
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <Routes>
        <Route
          path="/books/:bookId"
          element={
            <ReaderPage
              runtime={{
                render: vi.fn(async ({ onRelocated, onTocChange }) => {
                  onTocChange?.([{ id: "chap-1", label: "Chapter One" }]);
                  onRelocated?.({
                    cfi: "epubcfi(/6/2!/4/1:0)",
                    progress: 0.42,
                    spineItemId: "chap-1",
                  });

                  return {
                    applyPreferences: vi.fn(async () => undefined),
                    destroy() {
                      return undefined;
                    },
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
    expect(screen.getByRole("progressbar", { name: /reading progress/i })).toHaveAttribute("aria-valuenow", "42");
  });

  await user.click(screen.getByRole("button", { name: /bookmark this location/i }));

  await waitFor(() => {
    expect(screen.getByLabelText(/saved markers/i)).toHaveTextContent("Chapter One");
    expect(screen.getByRole("button", { name: /remove bookmark from this location/i })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: /remove bookmark from this location/i }));

  await waitFor(() => {
    expect(screen.getByLabelText(/saved markers/i)).toHaveTextContent("No bookmarks saved yet.");
    expect(screen.getByRole("button", { name: /bookmark this location/i })).toBeInTheDocument();
  });
});
