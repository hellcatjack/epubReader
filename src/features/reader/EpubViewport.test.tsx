import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { EpubViewport } from "./EpubViewport";
import type { EpubViewportRuntime, RuntimeRenderHandle } from "./epubRuntime";

it("falls back to chapter start when a saved cfi is invalid", async () => {
  const controller = {
    open: vi
      .fn<(bookId: string, cfi?: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("invalid cfi"))
      .mockResolvedValueOnce(undefined),
    observeSelection: vi.fn(() => () => undefined),
    observeChapterChanges: vi.fn(() => () => undefined),
    currentCfi: "",
    mode: "paginated" as const,
    sandbox: "allow-same-origin",
    getToc: vi.fn(async () => []),
    goToLocation: vi.fn(async () => undefined),
  };

  render(<EpubViewport bookId="book-1" controller={controller} initialCfi="epubcfi(invalid)" />);

  expect(await screen.findByText(/opened from chapter start/i)).toBeInTheDocument();
  expect(controller.open).toHaveBeenNthCalledWith(1, "book-1", "epubcfi(invalid)");
  expect(controller.open).toHaveBeenNthCalledWith(2, "book-1", undefined);
});

it("uses the runtime renderer for persisted books when no test controller is provided", async () => {
  const runtime = {
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
  };

  render(<EpubViewport bookId="book-1" runtime={runtime} />);

  expect(await screen.findByText(/opened from chapter start/i)).toBeInTheDocument();
  expect(runtime.render).toHaveBeenCalledWith(
    expect.objectContaining({
      bookId: "book-1",
      initialCfi: undefined,
    }),
  );
});

it("falls back to a saved chapter and quote when the saved cfi cannot be reopened", async () => {
  const findCfiFromTextQuote = vi.fn(async () => "epubcfi(/6/8!/4/1:12)");
  const goTo = vi.fn(async () => undefined);
  const runtime = {
    render: vi
      .fn()
      .mockRejectedValueOnce(new Error("invalid cfi"))
      .mockResolvedValueOnce({
        applyPreferences: vi.fn(async () => undefined),
        destroy() {
          return undefined;
        },
        findCfiFromTextQuote,
        getTextFromCurrentLocation: vi.fn(async () => ""),
        goTo,
        next: vi.fn(async () => undefined),
        prev: vi.fn(async () => undefined),
        setActiveTtsSegment: vi.fn(async () => undefined),
        setFlow: vi.fn(async () => undefined),
      }),
  };

  render(
    <EpubViewport
      bookId="book-1"
      initialCfi="epubcfi(invalid)"
      initialProgress={{
        bookId: "book-1",
        cfi: "epubcfi(invalid)",
        progress: 0.42,
        spineItemId: "chapter-3",
        textQuote: "Morgan’s head was pressed against her pillow.",
        updatedAt: Date.now(),
      }}
      runtime={runtime}
    />,
  );

  expect(await screen.findByText(/recovered from saved reading position/i)).toBeInTheDocument();
  expect(runtime.render).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      initialCfi: "chapter-3",
    }),
  );
  expect(findCfiFromTextQuote).toHaveBeenCalledWith("Morgan’s head was pressed against her pillow.");
  expect(goTo).toHaveBeenCalledWith("epubcfi(/6/8!/4/1:12)");
});

it("destroys stale runtime handles that resolve after the viewport unmounts", async () => {
  let resolveRender: ((value: RuntimeRenderHandle) => void) | undefined;
  const destroy = vi.fn();
  const runtime: EpubViewportRuntime = {
    render: vi.fn(
      () =>
        new Promise<RuntimeRenderHandle>((resolve) => {
          resolveRender = resolve;
        }),
    ),
  };

  const { unmount } = render(<EpubViewport bookId="book-1" runtime={runtime} />);
  unmount();

  if (!resolveRender) {
    throw new Error("render was not captured");
  }

  resolveRender({
    applyPreferences: async () => undefined,
    destroy,
    findCfiFromTextQuote: async () => null,
    getTextFromCurrentLocation: async () => "",
    goTo: async () => undefined,
    next: async () => undefined,
    prev: async () => undefined,
    setActiveTtsSegment: async () => undefined,
    setFlow: async () => undefined,
  });

  await vi.waitFor(() => {
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

it("forwards active tts segments to the runtime handle", async () => {
  const setActiveTtsSegment = vi.fn(async () => undefined);
  const runtime: EpubViewportRuntime = {
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
      setActiveTtsSegment,
      setFlow: vi.fn(async () => undefined),
    })),
  };

  const { rerender } = render(<EpubViewport bookId="book-1" runtime={runtime} />);
  expect(await screen.findByText(/opened from chapter start/i)).toBeInTheDocument();

  rerender(
    <EpubViewport
      activeTtsSegment={{ spineItemId: "chap-1", text: "Second paragraph should stay highlighted." }}
      bookId="book-1"
      runtime={runtime}
    />,
  );

  await vi.waitFor(() => {
    expect(setActiveTtsSegment).toHaveBeenLastCalledWith({
      spineItemId: "chap-1",
      text: "Second paragraph should stay highlighted.",
    });
  });
});
