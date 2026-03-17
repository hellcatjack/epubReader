import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import { resetDb } from "../../lib/db/appDb";
import { getSettings } from "../settings/settingsRepository";
import type { ActiveTtsSegment, RuntimeRenderHandle } from "./epubRuntime";
import { ReaderPage } from "./ReaderPage";

afterEach(async () => {
  vi.unstubAllGlobals();
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

  if (!resolveRender) {
    throw new Error("render was not captured");
  }

  resolveRender({
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
