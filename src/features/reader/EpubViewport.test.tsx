import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { EpubViewport } from "./EpubViewport";

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
      goTo: vi.fn(async () => undefined),
      next: vi.fn(async () => undefined),
      prev: vi.fn(async () => undefined),
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
