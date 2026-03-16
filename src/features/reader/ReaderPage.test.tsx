import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { ReaderPage } from "./ReaderPage";

it("shows toc, reading progress, bookmark toggle, and the reader tools surface", () => {
  render(<ReaderPage />);

  expect(screen.getByRole("navigation", { name: /table of contents/i })).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: /reading progress/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bookmark this location/i })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: /reader tools/i })).toBeInTheDocument();
});

it("switches reading modes and pages through the active rendition", async () => {
  const user = userEvent.setup();
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
                  getTextFromCurrentLocation: vi.fn(async () => "First chunk.\n\nSecond chunk."),
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

  await user.click(screen.getByRole("button", { name: /start tts/i }));

  await waitFor(() => {
    expect(ai.synthesizeSpeech).toHaveBeenCalledWith(
      "First chunk.",
      expect.objectContaining({
        voice: "Ryan",
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
      "Second chunk.",
      expect.objectContaining({
        voice: "Ryan",
      }),
    );
  });

  await user.click(screen.getByRole("button", { name: /stop tts/i }));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/idle/i)).toBeInTheDocument();
});
