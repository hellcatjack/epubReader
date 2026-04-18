import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { db, resetDb } from "../../lib/db/appDb";
import type { AiService } from "../ai/aiService";
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

function installSpeechSynthesis(
  voices: SpeechSynthesisVoice[],
  options: {
    autoStart?: boolean;
  } = {},
) {
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
    startCurrent() {
      currentUtterance?.onstart?.(new Event("start") as SpeechSynthesisEvent);
    },
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

function installChromeDesktopUserAgent() {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (X11; Linux x86_64) Chrome/123.0",
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
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      sentenceContext: "She said hello softly before leaving the room.",
      spineItemId: "chap-1",
      text: "Hello",
    });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledWith(
      "Hello",
      expect.objectContaining({
        sentenceContext: "She said hello softly before leaving the room.",
        targetLanguage: "zh-CN",
      }),
    );
  });
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
  expect(await screen.findByText("你好，世界")).toBeInTheDocument();
  expect(screen.getByLabelText("Translation result")).toHaveTextContent("你好，世界");
  expect(screen.queryByLabelText("Explanation result")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /explain/i }));
  expect(ai.explainSelection).toHaveBeenCalledWith(
    "Hello",
    expect.objectContaining({ targetLanguage: "zh-CN" }),
  );
  const explainPopup = await screen.findByRole("dialog", { name: /grammar explanation/i });
  expect(explainPopup).toHaveTextContent("A short contextual explanation");
  expect(screen.getByLabelText("Translation result")).toHaveTextContent("你好，世界");

  await user.click(screen.getByRole("button", { name: /add note/i }));
  expect(screen.getByRole("textbox", { name: /note body/i })).toBeInTheDocument();
  expect(screen.getAllByText(/hello/i).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /read aloud/i })).toBeInTheDocument();
});

it("shows ipa for a released single-word selection", async () => {
  installEdgeDesktopUserAgent();
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => [{ phonetics: [{ text: "/prest/" }] }],
      ok: true,
    })),
  );
  const ai = {
    translateSelection: vi.fn(async () => "按压"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", isReleased: true, spineItemId: "chap-1", text: "pressed" });
  });

  expect(await screen.findByText("按压")).toBeInTheDocument();
  expect(await screen.findByText("/prest/")).toBeInTheDocument();
});

it("does not show ipa for a multi-word selection", async () => {
  installEdgeDesktopUserAgent();
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/v1/models")) {
      return {
        json: async () => ({ data: [{ id: "local-reader-chat" }] }),
        ok: true,
      };
    }

    return {
      json: async () => [{ phonetics: [{ text: "/ignored/" }] }],
      ok: true,
    };
  });
  vi.stubGlobal("fetch", fetchSpy);
  const ai = {
    translateSelection: vi.fn(async () => "事情是这样的"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      isReleased: true,
      selectionRect: {
        bottom: 246,
        height: 24,
        left: 120,
        right: 280,
        top: 222,
        width: 160,
      },
      spineItemId: "chap-1",
      text: "The thing",
    });
  });

  expect(await screen.findByRole("status", { name: /selection translation/i })).toHaveTextContent("事情是这样的");
  expect(screen.getByLabelText("Translation result")).not.toHaveTextContent("事情是这样的");
  expect(screen.queryByText(/^IPA$/i)).not.toBeInTheDocument();
  const phoneticCalls = fetchSpy.mock.calls.filter(([input]) => !String(input).endsWith("/v1/models"));
  expect(phoneticCalls).toHaveLength(0);
});

it("clears the previous reading assistant translation and ipa when a multi-word selection is translated in a bubble", async () => {
  installChromeDesktopUserAgent();
  installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Microsoft Ava Online (Natural)",
      voiceURI: "Microsoft Ava Online (Natural)",
    },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => [{ phonetics: [{ text: "/prest/" }] }],
      ok: true,
    })),
  );
  const ai = {
    translateSelection: vi
      .fn<AiService["translateSelection"]>()
      .mockResolvedValueOnce("按压")
      .mockResolvedValueOnce("事情是这样的"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "pressed",
    });
  });

  expect(await screen.findByText("按压")).toBeInTheDocument();
  expect(await screen.findByText("/prest/")).toBeInTheDocument();

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:8)",
      isReleased: true,
      selectionRect: {
        bottom: 246,
        height: 24,
        left: 120,
        right: 332,
        top: 222,
        width: 212,
      },
      spineItemId: "chap-1",
      text: "The thing",
    });
  });

  expect(await screen.findByRole("status", { name: /selection translation/i })).toHaveTextContent("事情是这样的");
  expect(screen.getByLabelText("Translation result")).not.toHaveTextContent("按压");
  expect(screen.getByLabelText("Translation result")).not.toHaveTextContent("事情是这样的");
  expect(screen.queryByText("/prest/")).not.toBeInTheDocument();
});

it("does not start stale ipa requests before delayed auto-translation begins", async () => {
  installEdgeDesktopUserAgent();
  const speech = installSpeechSynthesis(
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
  let phoneticRequestCount = 0;
  const fetchSpy = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/v1/models")) {
      return Promise.resolve({
        json: async () => ({ data: [{ id: "local-reader-chat" }] }),
        ok: true,
      });
    }

    phoneticRequestCount += 1;
    return Promise.resolve({
      json: async () => [{ phonetics: [{ text: "/sekənd/" }] }],
      ok: true,
    });
  });
  vi.stubGlobal("fetch", fetchSpy);
  const ai = {
    translateSelection: vi.fn(async (text: string) => (text === "pressed" ? "按压" : "第二个")),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", isReleased: true, spineItemId: "chap-1", text: "pressed" });
  });
  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:4)", isReleased: true, spineItemId: "chap-1", text: "second" });
  });
  act(() => {
    speech.startCurrent();
  });

  await waitFor(() => {
    expect(phoneticRequestCount).toBe(1);
  });

  expect(await screen.findByText("第二个")).toBeInTheDocument();
  expect(await screen.findByText("/sekənd/")).toBeInTheDocument();
  expect(screen.queryByText("/prest/")).not.toBeInTheDocument();
  expect(ai.translateSelection).toHaveBeenCalledTimes(1);
  expect(ai.translateSelection).toHaveBeenCalledWith("second", {
    sentenceContext: undefined,
    targetLanguage: "zh-CN",
  });
});

it("keeps translation visible when explain fails", async () => {
  const user = userEvent.setup();
  installEdgeDesktopUserAgent();
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
    translateSelection: vi.fn(async () => "按压"),
    explainSelection: vi.fn(async () => {
      throw new Error("provider unavailable");
    }),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ cfiRange: "epubcfi(/6/2!/4/1:0)", isReleased: true, spineItemId: "chap-1", text: "pressed" });
  });

  expect(await screen.findByText("按压")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /explain/i }));

  expect(await screen.findByText(/语法解析失败：/)).toBeInTheDocument();
  expect(screen.getByLabelText("Translation result")).toHaveTextContent("按压");
});

it("waits until the selection is released before auto-translating and auto-reading", async () => {
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
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      isReleased: false,
      spineItemId: "chap-1",
      text: "Hello world",
    });
  });

  await act(async () => {
    await Promise.resolve();
  });

  expect(ai.translateSelection).not.toHaveBeenCalled();
  expect(browserTts.speechSynthesis.speak).not.toHaveBeenCalled();

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "Hello world",
    });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
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

it("does not auto-read released selections with more than 30 English letters", async () => {
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
    translateSelection: vi.fn(async () => "超过阈值翻译"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "abcdefghij klmnopqrst uvwxyzabcde",
    });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledTimes(1);
  });

  expect(browserTts.speechSynthesis.speak).not.toHaveBeenCalled();
});

it("still auto-reads released selections with exactly 30 English letters", async () => {
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
    translateSelection: vi.fn(async () => "边界翻译"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => new Blob(["audio"], { type: "audio/wav" })),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({
      cfiRange: "epubcfi(/6/2!/4/1:0)",
      isReleased: true,
      spineItemId: "chap-1",
      text: "abcdefghij klmnopqrst uvwxyzabcd",
    });
  });

  await waitFor(() => {
    expect(ai.translateSelection).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(browserTts.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
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

  const ttsQueue = screen.getByRole("region", { name: /tts queue/i });
  await waitFor(() => {
    expect(within(ttsQueue).getByText(/^ready$/i, { selector: ".reader-tts-badge" })).toBeInTheDocument();
  });
});

it("allows read aloud in chrome when browser speech synthesis and english voices are available", async () => {
  const user = userEvent.setup();
  installChromeDesktopUserAgent();
  const browserTts = installSpeechSynthesis([
    {
      default: true,
      lang: "en-US",
      localService: false,
      name: "Google US English",
      voiceURI: "Google US English",
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
    expect(screen.getByRole("progressbar", { name: /reading progress/i })).toHaveAttribute("aria-valuenow", "42");
  });
  expect(screen.getByText("42%")).toBeInTheDocument();

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
