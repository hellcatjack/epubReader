import "@testing-library/jest-dom/vitest";
import { act, render } from "@testing-library/react";
import { vi } from "vitest";
import { saveProgress } from "../bookshelf/progressRepository";
import { EpubViewport } from "./EpubViewport";
import type { EpubViewportRuntime, RuntimeRenderHandle } from "./epubRuntime";

vi.mock("../bookshelf/progressRepository", () => ({
  saveProgress: vi.fn(async () => undefined),
}));

type RelocatedHandler = NonNullable<Parameters<EpubViewportRuntime["render"]>[0]["onRelocated"]>;

it("falls back to chapter start when a saved cfi is invalid", async () => {
  const onStatusChange = vi.fn();
  const secondHandle = {
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
  const runtime = {
    render: vi.fn().mockRejectedValueOnce(new Error("invalid cfi")).mockResolvedValueOnce(secondHandle),
  };

  render(<EpubViewport bookId="book-1" initialCfi="epubcfi(invalid)" onStatusChange={onStatusChange} runtime={runtime} />);

  await vi.waitFor(() => {
    expect(onStatusChange).toHaveBeenLastCalledWith("Opened from chapter start.");
  });
  expect(runtime.render).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      bookId: "book-1",
      initialCfi: "epubcfi(invalid)",
    }),
  );
  expect(runtime.render).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      bookId: "book-1",
      initialCfi: undefined,
    }),
  );
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

it("keeps an explicit paginated mode target exact even when it matches the saved cfi", async () => {
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
      initialCfi="epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)"
      initialProgress={{
        bookId: "book-1",
        cfi: "epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)",
        progress: 0.42,
        spineItemId: "ch004.xhtml",
        textQuote: "10:1 These are the generations of the sons of Noah.",
        updatedAt: Date.now(),
      }}
      preferExactInitialTarget
      readingMode="paginated"
      runtime={runtime}
    />,
  );

  await vi.waitFor(() => {
    expect(runtime.render).toHaveBeenCalledWith(
      expect.objectContaining({
        initialCfi: "epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)",
      }),
    );
  });
});

it("passes the saved scrolled scrollTop to the runtime when restoring a same-tab refresh snapshot", async () => {
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
      initialCfi="epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)"
      initialProgress={{
        bookId: "book-1",
        cfi: "epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)",
        progress: 0.42,
        scrollTop: 13824,
        spineItemId: "ch004.xhtml",
        textQuote: "10:1 These are the generations of the sons of Noah.",
        updatedAt: Date.now(),
      }}
      readingMode="scrolled"
      runtime={runtime}
    />,
  );

  await vi.waitFor(() => {
    expect(runtime.render).toHaveBeenCalledWith(
      expect.objectContaining({
        initialCfi: "epubcfi(/6/12!/4/166/2[v01010001]/2/1:0)",
        initialScrollTop: 13824,
      }),
    );
  });
});

it("coalesces dense scrolled relocation updates and flushes the latest location", async () => {
  vi.useFakeTimers();
  const onLocationChange = vi.fn();
  let onRelocated: RelocatedHandler | undefined;
  const runtime: EpubViewportRuntime = {
    render: vi.fn(async (args) => {
      onRelocated = args.onRelocated;
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

  render(<EpubViewport bookId="book-1" onLocationChange={onLocationChange} readingMode="scrolled" runtime={runtime} />);

  await vi.waitFor(() => {
    expect(onRelocated).toBeTypeOf("function");
  });

  const first = {
    cfi: "epubcfi(/6/2!/4/1:0)",
    progress: 0.1,
    scrollTop: 120,
    spineItemId: "chapter-1.xhtml",
    textQuote: "First visible paragraph.",
  };
  const second = {
    cfi: "epubcfi(/6/2!/4/1:20)",
    progress: 0.12,
    scrollTop: 240,
    spineItemId: "chapter-1.xhtml",
    textQuote: "Second visible paragraph.",
  };
  const third = {
    cfi: "epubcfi(/6/2!/4/1:40)",
    progress: 0.14,
    scrollTop: 360,
    spineItemId: "chapter-1.xhtml",
    textQuote: "Third visible paragraph.",
  };

  act(() => {
    onRelocated?.(first as never);
    onRelocated?.(second as never);
    onRelocated?.(third as never);
  });

  expect(onLocationChange).toHaveBeenCalledTimes(1);
  expect(onLocationChange).toHaveBeenLastCalledWith(first);
  expect(saveProgress).toHaveBeenCalledTimes(1);
  expect(saveProgress).toHaveBeenLastCalledWith("book-1", first);

  await act(async () => {
    vi.advanceTimersByTime(300);
  });

  expect(onLocationChange).toHaveBeenCalledTimes(2);
  expect(onLocationChange).toHaveBeenLastCalledWith(third);
  expect(saveProgress).toHaveBeenCalledTimes(2);
  expect(saveProgress).toHaveBeenLastCalledWith("book-1", third);

  vi.useRealTimers();
});

it("does not force an extra paginated goTo cycle on window resize", async () => {
  vi.useFakeTimers();
  const findCfiFromTextQuote = vi.fn(async () => "epubcfi(/6/2!/4/1:24)");
  const getCurrentLocation = vi.fn(async () => ({
    cfi: "epubcfi(/6/2!/4/1:12)",
    pageIndex: 5,
    pageOffset: 2730,
    progress: 0.42,
    spineItemId: "chapter-2.xhtml",
    textQuote: "Stable paragraph from the current page.",
  }));
  const goTo = vi.fn(async () => undefined);
  const runtime: EpubViewportRuntime = {
    render: vi.fn(async () => ({
      applyPreferences: vi.fn(async () => undefined),
      destroy() {
        return undefined;
      },
      findCfiFromTextQuote,
      getCurrentLocation,
      getTextFromCurrentLocation: vi.fn(async () => ""),
      goTo,
      next: vi.fn(async () => undefined),
      prev: vi.fn(async () => undefined),
      setActiveTtsSegment: vi.fn(async () => undefined),
      setFlow: vi.fn(async () => undefined),
    })),
  };

  render(<EpubViewport bookId="book-1" readingMode="paginated" runtime={runtime} />);

  await vi.waitFor(() => {
    expect(runtime.render).toHaveBeenCalledTimes(1);
  });

  act(() => {
    window.dispatchEvent(new Event("resize"));
  });

  await act(async () => {
    vi.advanceTimersByTime(300);
  });

  expect(getCurrentLocation).not.toHaveBeenCalled();
  expect(findCfiFromTextQuote).not.toHaveBeenCalled();
  expect(goTo).not.toHaveBeenCalled();

  vi.useRealTimers();
});

it("does not force a scrolled recovery goTo when resize stays on the same passage", async () => {
  vi.useFakeTimers();
  let onRelocated: RelocatedHandler | undefined;
  const goTo = vi.fn(async () => undefined);
  const runtime: EpubViewportRuntime = {
    render: vi.fn(async (args) => {
      onRelocated = args.onRelocated;
      return {
        applyPreferences: vi.fn(async () => undefined),
        destroy() {
          return undefined;
        },
        findCfiFromTextQuote: vi.fn(async () => null),
        getTextFromCurrentLocation: vi.fn(async () => ""),
        goTo,
        next: vi.fn(async () => undefined),
        prev: vi.fn(async () => undefined),
        setActiveTtsSegment: vi.fn(async () => undefined),
        setFlow: vi.fn(async () => undefined),
      };
    }),
  };

  render(<EpubViewport bookId="book-1" readingMode="scrolled" runtime={runtime} />);

  await vi.waitFor(() => {
    expect(onRelocated).toBeTypeOf("function");
  });

  const baseline = {
    cfi: "epubcfi(/6/12!/4/8/2[v01001001]/2/1:0)",
    progress: 0.01,
    scrollTop: 1467,
    spineItemId: "chapter-1.xhtml",
    textQuote: "In the beginning, God created the heavens and the earth.",
  };

  act(() => {
    onRelocated?.(baseline as never);
    window.dispatchEvent(new Event("resize"));
    onRelocated?.({
      ...baseline,
      scrollTop: 1466,
    } as never);
  });

  await act(async () => {
    vi.advanceTimersByTime(600);
  });

  expect(goTo).not.toHaveBeenCalled();

  vi.useRealTimers();
});

it("reanchors the last stable scrolled passage after resize drift", async () => {
  vi.useFakeTimers();
  let onRelocated: RelocatedHandler | undefined;
  const goTo = vi.fn(async () => undefined);
  const runtime: EpubViewportRuntime = {
    render: vi.fn(async (args) => {
      onRelocated = args.onRelocated;
      return {
        applyPreferences: vi.fn(async () => undefined),
        destroy() {
          return undefined;
        },
        findCfiFromTextQuote: vi.fn(async () => null),
        getTextFromCurrentLocation: vi.fn(async () => ""),
        goTo,
        next: vi.fn(async () => undefined),
        prev: vi.fn(async () => undefined),
        setActiveTtsSegment: vi.fn(async () => undefined),
        setFlow: vi.fn(async () => undefined),
      };
    }),
  };

  render(<EpubViewport bookId="book-1" readingMode="scrolled" runtime={runtime} />);

  await vi.waitFor(() => {
    expect(onRelocated).toBeTypeOf("function");
  });

  const baseline = {
    cfi: "epubcfi(/6/12!/4/8/2[v01001001]/2/1:0)",
    progress: 0.01,
    scrollTop: 1467,
    spineItemId: "chapter-1.xhtml",
    textQuote: "In the beginning, God created the heavens and the earth.",
  };

  act(() => {
    onRelocated?.(baseline as never);
    window.dispatchEvent(new Event("resize"));
    onRelocated?.({
      cfi: "epubcfi(/6/12!/4/2[v01000000]/1:0)",
      progress: 0.006,
      scrollTop: 0,
      spineItemId: "chapter-1.xhtml",
      textQuote: "GENESIS",
    } as never);
  });

  await act(async () => {
    vi.advanceTimersByTime(600);
  });

  expect(goTo).toHaveBeenCalledWith(baseline.cfi);

  vi.useRealTimers();
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
  const firstHandle = {
    applyPreferences: vi.fn(async () => undefined),
    destroy: vi.fn(() => undefined),
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  };
  const secondHandle = {
    applyPreferences: vi.fn(async () => undefined),
    destroy: vi.fn(() => undefined),
    findCfiFromTextQuote: vi.fn(async () => null),
    getTextFromCurrentLocation: vi.fn(async () => ""),
    goTo: vi.fn(async () => undefined),
    next: vi.fn(async () => undefined),
    prev: vi.fn(async () => undefined),
    setActiveTtsSegment: vi.fn(async () => undefined),
    setFlow: vi.fn(async () => undefined),
  };
  const runtime: EpubViewportRuntime = {
    render: vi
      .fn<() => Promise<typeof firstHandle>>()
      .mockResolvedValueOnce(firstHandle)
      .mockResolvedValueOnce(secondHandle),
  };

  const activeSegment = {
    spineItemId: "chap-1",
    text: "Second paragraph should stay highlighted.",
  };

  const { rerender } = render(
    <EpubViewport activeTtsSegment={activeSegment} bookId="book-1" readingMode="scrolled" runtime={runtime} />,
  );

  await vi.waitFor(() => {
    expect(firstHandle.setActiveTtsSegment).toHaveBeenCalledWith(activeSegment);
  });

  rerender(
    <EpubViewport activeTtsSegment={activeSegment} bookId="book-1" readingMode="paginated" runtime={runtime} />,
  );

  await vi.waitFor(() => {
    expect(runtime.render).toHaveBeenCalledTimes(2);
    expect(firstHandle.destroy).toHaveBeenCalledTimes(1);
    expect(secondHandle.setActiveTtsSegment).toHaveBeenCalledWith(activeSegment);
  });
});

it("forwards the follow playback setting to the runtime handle", async () => {
  const setTtsPlaybackFollow = vi.fn(async () => undefined);
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
      setActiveTtsSegment: vi.fn(async () => undefined),
      setFlow: vi.fn(async () => undefined),
      setTtsPlaybackFollow,
    })),
  };

  const { rerender } = render(<EpubViewport bookId="book-1" runtime={runtime} ttsFollowPlayback={false} />);

  await vi.waitFor(() => {
    expect(setTtsPlaybackFollow).toHaveBeenCalledWith(false);
  });

  rerender(<EpubViewport bookId="book-1" runtime={runtime} ttsFollowPlayback />);

  await vi.waitFor(() => {
    expect(setTtsPlaybackFollow).toHaveBeenLastCalledWith(true);
  });
});
