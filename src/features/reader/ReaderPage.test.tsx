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
