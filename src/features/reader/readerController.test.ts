import { expect, it, vi } from "vitest";
import { createReaderController } from "./readerController";

it("opens a stored book and restores the saved CFI in paginated mode", async () => {
  const display = vi.fn(async () => undefined);
  const controller = createReaderController({
    loadBook: async () => new Blob(["epub-bytes"], { type: "application/epub+zip" }),
    createBook: async () => ({
      getToc: async () => [{ id: "chap-1", label: "Chapter 1" }],
      display,
      destroy: () => undefined,
    }),
  });

  await controller.open("book-1", "epubcfi(/6/2[chap]!/4/1:0)");

  expect(controller.mode).toBe("paginated");
  expect(controller.sandbox).toContain("allow-same-origin");
  expect(controller.currentCfi).toBe("epubcfi(/6/2[chap]!/4/1:0)");
  expect(await controller.getToc()).toEqual([{ id: "chap-1", label: "Chapter 1" }]);
  expect(display).toHaveBeenCalledWith("epubcfi(/6/2[chap]!/4/1:0)");
  expect(controller.observeSelection).toEqual(expect.any(Function));
  expect(controller.observeChapterChanges).toEqual(expect.any(Function));
});
