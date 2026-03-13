import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { resetDb } from "../../lib/db/appDb";
import { ReaderPage } from "./ReaderPage";
import { selectionBridge } from "./selectionBridge";

afterEach(async () => {
  selectionBridge.publish(null);
  await resetDb();
});

it("routes selection actions to translate, explain, and note editing while read aloud stays disabled", async () => {
  const user = userEvent.setup();
  const ai = {
    translateSelection: vi.fn(async () => "你好，世界"),
    explainSelection: vi.fn(async () => "A short contextual explanation"),
    synthesizeSpeech: vi.fn(async () => {
      throw new Error("unsupported");
    }),
  };

  render(<ReaderPage ai={ai} />);

  act(() => {
    selectionBridge.publish({ text: "Hello world" });
  });

  await user.click(screen.getByRole("button", { name: /translate/i }));
  expect(ai.translateSelection).toHaveBeenCalledWith(
    "Hello world",
    expect.objectContaining({ targetLanguage: expect.any(String) }),
  );
  expect(await screen.findByText("你好，世界")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /explain/i }));
  expect(ai.explainSelection).toHaveBeenCalledWith(
    "Hello world",
    expect.objectContaining({ targetLanguage: expect.any(String) }),
  );
  expect(await screen.findByText("A short contextual explanation")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /add note/i }));
  expect(screen.getByRole("textbox", { name: /note body/i })).toBeInTheDocument();
  expect(screen.getAllByText(/hello world/i).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /read aloud unavailable/i })).toBeDisabled();
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
                  destroy() {
                    return undefined;
                  },
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
