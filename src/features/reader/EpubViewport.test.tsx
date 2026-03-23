import "@testing-library/jest-dom/vitest";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";
import { EpubViewport } from "./EpubViewport";
import type { EpubViewportRuntime, RuntimeRenderHandle } from "./epubRuntime";

it("falls back to chapter start when a saved cfi is invalid", async () => {
  const onStatusChange = vi.fn();
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

  render(
    <EpubViewport bookId="book-1" controller={controller} initialCfi="epubcfi(invalid)" onStatusChange={onStatusChange} />,
  );

  await vi.waitFor(() => {
    expect(onStatusChange).toHaveBeenLastCalledWith("Opened from chapter start.");
  });
  expect(controller.open).toHaveBeenNthCalledWith(1, "book-1", "epubcfi(invalid)");
  expect(controller.open).toHaveBeenNthCalledWith(2, "book-1", undefined);
});

it("uses the runtime renderer for persisted books when no test controller is provided", async () => {
  const onStatusChange = vi.fn();
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

  render(<EpubViewport bookId="book-1" onStatusChange={onStatusChange} runtime={runtime} />);

  await vi.waitFor(() => {
    expect(onStatusChange).toHaveBeenLastCalledWith("Opened from chapter start.");
  });
  expect(runtime.render).toHaveBeenCalledWith(
    expect.objectContaining({
      bookId: "book-1",
      initialCfi: undefined,
    }),
  );
});

it("persists image-page presentation state on the viewport root", async () => {
  const runtime: EpubViewportRuntime = {
    render: vi.fn(async ({ onPagePresentationChange }) => {
      onPagePresentationChange?.("image");
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
  };

  const { container } = render(<EpubViewport bookId="book-1" runtime={runtime} />);

  await vi.waitFor(() => {
    expect(container.querySelector(".epub-root")).toHaveAttribute("data-page-kind", "image");
  });
});

it("falls back to a saved chapter and quote when the saved cfi cannot be reopened", async () => {
  const onStatusChange = vi.fn();
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
      onStatusChange={onStatusChange}
      runtime={runtime}
    />,
  );

  await vi.waitFor(() => {
    expect(onStatusChange).toHaveBeenLastCalledWith("Recovered from saved reading position.");
  });
  expect(runtime.render).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      initialCfi: "chapter-3",
    }),
  );
  expect(findCfiFromTextQuote).toHaveBeenCalledWith("Morgan’s head was pressed against her pillow.");
  expect(goTo).toHaveBeenCalledWith("epubcfi(/6/8!/4/1:12)");
});

it("respects explicit navigation targets in paginated mode instead of reopening the saved chapter", async () => {
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

  render(
    <EpubViewport
      bookId="book-1"
      initialCfi="chapter-2.xhtml"
      initialProgress={{
        bookId: "book-1",
        cfi: "epubcfi(/6/2!/4/1:0)",
        pageIndex: 3,
        progress: 0.42,
        spineItemId: "chapter-1.xhtml",
        textQuote: "A saved sentence from chapter one.",
        updatedAt: Date.now(),
      }}
      readingMode="paginated"
      runtime={runtime}
    />,
  );

  await vi.waitFor(() => {
    expect(runtime.render).toHaveBeenCalledWith(
      expect.objectContaining({
        initialCfi: "chapter-2.xhtml",
      }),
    );
  });
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

it("does not let a stale rerender wipe the latest viewport content", async () => {
  let resolveFirstRender: ((value: RuntimeRenderHandle) => void) | undefined;
  const destroyFirst = vi.fn();
  const runtime: EpubViewportRuntime = {
    render: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<RuntimeRenderHandle>((resolve) => {
            resolveFirstRender = (handle) => {
              resolve(handle);
            };
          }),
      )
      .mockImplementationOnce(async () => ({
          applyPreferences: async () => undefined,
          destroy() {
            return undefined;
          },
          findCfiFromTextQuote: async () => null,
          getTextFromCurrentLocation: async () => "",
          goTo: async () => undefined,
          next: async () => undefined,
          prev: async () => undefined,
          setActiveTtsSegment: async () => undefined,
          setFlow: async () => undefined,
        })),
  };

  const { rerender } = render(<EpubViewport bookId="book-1" runtime={runtime} />);

  await vi.waitFor(() => {
    expect(runtime.render).toHaveBeenCalledTimes(1);
    expect(resolveFirstRender).toBeTypeOf("function");
  });

  rerender(
    <EpubViewport
      bookId="book-1"
      initialProgress={{
        bookId: "book-1",
        cfi: "epubcfi(/6/2!/4/2/1:0)",
        progress: 0.4,
        spineItemId: "chapter-1.xhtml",
        textQuote: "The thing was, she was so darn comfortable.",
        updatedAt: Date.now(),
      }}
      runtime={runtime}
    />,
  );

  await vi.waitFor(() => {
    expect(runtime.render).toHaveBeenCalledTimes(2);
  });

  await act(async () => {
    resolveFirstRender?.({
      applyPreferences: async () => undefined,
      destroy: destroyFirst,
      findCfiFromTextQuote: async () => null,
      getTextFromCurrentLocation: async () => "",
      goTo: async () => undefined,
      next: async () => undefined,
      prev: async () => undefined,
      setActiveTtsSegment: async () => undefined,
      setFlow: async () => undefined,
    });
  });

  await vi.waitFor(() => {
    expect(destroyFirst).toHaveBeenCalledTimes(1);
  });
});

it("forwards active tts segments to the runtime handle", async () => {
  const onStatusChange = vi.fn();
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

  const { rerender } = render(<EpubViewport bookId="book-1" onStatusChange={onStatusChange} runtime={runtime} />);
  await vi.waitFor(() => {
    expect(onStatusChange).toHaveBeenLastCalledWith("Opened from chapter start.");
  });

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

it("reapplies the active tts segment after a reading-mode flow change settles", async () => {
  const setActiveTtsSegment = vi.fn(async () => undefined);
  const setFlow = vi.fn(async () => undefined);
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
      setFlow,
    })),
  };

  const activeSegment = {
    spineItemId: "chap-1",
    text: "Second paragraph should stay highlighted.",
  };

  const { rerender } = render(
    <EpubViewport activeTtsSegment={activeSegment} bookId="book-1" readingMode="scrolled" runtime={runtime} />,
  );

  await vi.waitFor(() => {
    expect(setActiveTtsSegment).toHaveBeenCalledWith(activeSegment);
  });

  setActiveTtsSegment.mockClear();

  rerender(
    <EpubViewport activeTtsSegment={activeSegment} bookId="book-1" readingMode="paginated" runtime={runtime} />,
  );

  await vi.waitFor(() => {
    expect(setFlow).toHaveBeenCalledWith("paginated");
    expect(setActiveTtsSegment).toHaveBeenCalledWith(activeSegment);
  });
});
