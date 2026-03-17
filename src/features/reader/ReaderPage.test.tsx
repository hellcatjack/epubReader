import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";
import type { RuntimeRenderHandle } from "./epubRuntime";
import { ReaderPage } from "./ReaderPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubTtsHealth({
  prewarmDelayMs = 0,
  warmed = true,
}: {
  prewarmDelayMs?: number;
  warmed?: boolean;
} = {}) {
  let healthChecks = 0;
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith("/health")) {
      healthChecks += 1;
      const isWarmed = warmed || healthChecks > 1;
      return new Response(
        JSON.stringify({
          backend: "kokoro",
          device: "cuda:0",
          status: isWarmed ? "ok" : "warming_up",
          version: "0.1.0",
          voiceCount: 4,
          warmed: isWarmed,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.endsWith("/prewarm")) {
      if (prewarmDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, prewarmDelayMs));
      }
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
  stubTtsHealth();
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
                    getTextFromCurrentLocation: vi.fn(async () => ""),
                    goTo: vi.fn(async () => undefined),
                    next,
                    prev,
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
    expect(setFlow).toHaveBeenCalledWith("paginated");
  });

  await user.click(screen.getByRole("button", { name: /next page/i }));
  expect(next).toHaveBeenCalled();

  fireEvent.keyDown(window, { key: "ArrowLeft" });

  await waitFor(() => {
    expect(prev).toHaveBeenCalled();
  });
});

it("applies live appearance changes through the active rendition handle", async () => {
  stubTtsHealth();
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
                  getTextFromCurrentLocation: vi.fn(async () => ""),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
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
  stubTtsHealth();
  const pause = vi.fn();
  const resume = vi.fn(async () => undefined);
  const stop = vi.fn();
  const playResolvers: Array<() => void> = [];
  const ai = {
    translateSelection: vi.fn(async () => "你好"),
    explainSelection: vi.fn(async () => "解释"),
    synthesizeSpeech: vi.fn(async (text: string) => new Blob([text], { type: "audio/wav" })),
  };
  const ttsPlayer = {
    destroy: vi.fn(),
    load: vi.fn(async () => "blob:mock-audio"),
    pause,
    play: vi.fn(async () => undefined),
    playUntilEnded: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          playResolvers.push(resolve);
        }),
    ),
    resume,
    stop,
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
                render: vi.fn(async () => ({
                  applyPreferences: vi.fn(async () => undefined),
                  destroy() {
                    return undefined;
                  },
                  getTextFromCurrentLocation: vi.fn(
                    async () =>
                      "First short paragraph for the opening segment keeps the first response tight and responsive for the listener.\n\nSecond short paragraph stays with the first so Kokoro can begin faster without turning every sentence into its own request.\n\nThird paragraph becomes the next queued segment for continuous reading once the opening audio is already playing in the reader.",
                  ),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
              ttsPlayer={ttsPlayer}
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
    expect(ai.synthesizeSpeech).toHaveBeenCalledWith(
      "First short paragraph for the opening segment keeps the first response tight and responsive for the listener. Second short paragraph stays with the first so Kokoro can begin faster without turning every sentence into its own request.",
      expect.objectContaining({
        voice: "af_heart",
      }),
    );
  });

  expect(await screen.findByText(/playing/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /pause tts/i }));
  expect(pause).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/paused/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /resume tts/i }));
  expect(resume).toHaveBeenCalledTimes(1);

  playResolvers.shift()?.();

  await waitFor(() => {
    expect(ai.synthesizeSpeech).toHaveBeenCalledWith(
      "Third paragraph becomes the next queued segment for continuous reading once the opening audio is already playing in the reader.",
      expect.objectContaining({
        voice: "af_heart",
      }),
    );
  });

  await user.click(screen.getByRole("button", { name: /stop tts/i }));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/idle/i)).toBeInTheDocument();
});

it("keeps start tts disabled until the reading surface is ready", async () => {
  stubTtsHealth();
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
    getTextFromCurrentLocation: async () => "Ready text",
    goTo: async () => undefined,
    next: async () => undefined,
    prev: async () => undefined,
    setFlow: async () => undefined,
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /start tts/i })).toBeEnabled();
  });
});

it("keeps start tts disabled when the current location has no readable text yet", async () => {
  stubTtsHealth();
  const renderRuntime = vi.fn(async (): Promise<RuntimeRenderHandle> => ({
    applyPreferences: vi.fn(async () => undefined),
    destroy: () => undefined,
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
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

it("shows warming up before kokoro health reports warmed", async () => {
  const fetchMock = stubTtsHealth({ prewarmDelayMs: 50, warmed: false });

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
                  getTextFromCurrentLocation: vi.fn(async () => "Ready text for Kokoro."),
                  goTo: vi.fn(async () => undefined),
                  next: vi.fn(async () => undefined),
                  prev: vi.fn(async () => undefined),
                  setFlow: vi.fn(async () => undefined),
                })),
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  expect(await screen.findByText(/tts status: warming up model/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /start tts/i })).toBeDisabled();

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/prewarm$/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
