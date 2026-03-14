import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import {
  getBook,
  getBookFile,
  saveBook,
  saveBookFile,
} from "../../features/bookshelf/bookshelfRepository";
import { getProgress, saveProgress } from "../../features/bookshelf/progressRepository";
import { getSettings, saveSettings } from "../../features/settings/settingsRepository";
import { resetDb } from "./appDb";

afterEach(async () => {
  await resetDb();
});

it("persists imported book blobs, settings, and reading progress", async () => {
  await saveBook({
    id: "book-1",
    title: "Demo",
    author: "Author",
    importHash: "hash-1",
    coverThumbnailBlob: new Blob(["cover"], { type: "image/png" }),
  });

  await saveBookFile("book-1", new Blob(["epub-bytes"], { type: "application/epub+zip" }));

  await saveSettings({
    apiKey: "test-key",
    targetLanguage: "zh-CN",
    theme: "sepia",
    ttsVoice: "alloy",
    fontScale: 1.1,
  });

  await saveProgress("book-1", {
    cfi: "epubcfi(/6/2[chap]!/4/1:0)",
    progress: 0.2,
  });

  const book = await getBook("book-1");
  const bookFile = await getBookFile("book-1");
  const settings = await getSettings();
  const progress = await getProgress("book-1");

  expect(book?.title).toBe("Demo");
  expect(book?.author).toBe("Author");
  expect(book?.coverThumbnailBlob).toBeInstanceOf(Blob);
  expect(bookFile).toBeInstanceOf(Blob);
  expect(settings).toMatchObject({
    apiKey: "test-key",
    targetLanguage: "zh-CN",
    ttsVoice: "alloy",
  });
  expect(progress).toMatchObject({
    cfi: "epubcfi(/6/2[chap]!/4/1:0)",
    progress: 0.2,
  });
});

it("merges partial settings updates with existing persisted reader preferences", async () => {
  await saveSettings({
    apiKey: "",
    columnCount: 2,
    contentPadding: 40,
    fontFamily: "book",
    fontScale: 1.15,
    letterSpacing: 0.03,
    lineHeight: 1.9,
    maxLineWidth: 780,
    paragraphIndent: 2,
    paragraphSpacing: 1.1,
    readingMode: "paginated",
    targetLanguage: "zh-CN",
    theme: "dark",
    ttsVoice: "disabled",
  });

  await saveSettings({
    readingMode: "scrolled",
  });

  await expect(getSettings()).resolves.toMatchObject({
    columnCount: 2,
    lineHeight: 1.9,
    readingMode: "scrolled",
    targetLanguage: "zh-CN",
    theme: "dark",
  });
});
