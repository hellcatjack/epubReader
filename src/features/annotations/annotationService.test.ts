import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { resetDb } from "../../lib/db/appDb";
import { annotationService } from "./annotationService";

afterEach(async () => {
  await resetDb();
});

it("creates, removes, and rehydrates bookmark, highlight, and note records", async () => {
  const bookmark = await annotationService.createBookmark("book-1", "chap-1", "epubcfi(/6/2!/4/1:0)");
  const highlight = await annotationService.createHighlight({
    bookId: "book-1",
    spineItemId: "chap-1",
    startCfi: "epubcfi(/6/2!/4/1:0)",
    endCfi: "epubcfi(/6/2!/4/1:12)",
    textQuote: "Hello world",
    color: "amber",
  });
  const note = await annotationService.createNote({
    ...highlight,
    body: "Remember this sentence",
  });

  expect(bookmark.id).toBeTruthy();
  expect(note.body).toBe("Remember this sentence");
  expect(await annotationService.queryVisible("book-1", "chap-1")).toHaveLength(3);

  await annotationService.removeBookmark(bookmark.id);

  expect(await annotationService.listByBook("book-1")).toHaveLength(2);
  expect(await annotationService.queryVisible("book-1", "chap-1")).toHaveLength(2);
});
