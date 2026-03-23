# EPUB Reader MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-first pure frontend PWA EPUB reader with a local bookshelf, paginated reading workspace, local annotations, and OpenAI-powered translate/explain/TTS.

**Architecture:** Use a Vite + React + TypeScript app with two route-level screens (`/` for bookshelf and `/books/:bookId` for reading). `epub.js` is wrapped by a dedicated reader controller. Dexie owns all IndexedDB persistence. A single OpenAI adapter powers translation, explanation, and speech synthesis. The right panel hosts AI results, note editing, and TTS status.

**Tech Stack:** React, TypeScript, Vite, React Router, Dexie, epub.js, vite-plugin-pwa, Vitest, React Testing Library, Playwright

**Repository note:** `/data/share/epubReader` is not currently a git repository. This plan initializes git in Task 1 so commit checkpoints work during implementation.

---

## Planned File Structure

- Root config
  - `package.json`
  - `tsconfig.json`
  - `vite.config.ts`
  - `vitest.config.ts`
  - `playwright.config.ts`
  - `.gitignore`
  - `index.html`
- App shell
  - `src/main.tsx`
  - `src/app/App.tsx`
  - `src/app/router.tsx`
  - `src/styles/global.css`
- Persistence and shared types
  - `src/lib/db/appDb.ts`
  - `src/lib/db/schema.ts`
  - `src/lib/types/books.ts`
  - `src/lib/types/annotations.ts`
  - `src/lib/types/settings.ts`
- Bookshelf
  - `src/features/bookshelf/BookshelfPage.tsx`
  - `src/features/bookshelf/BookshelfPage.test.tsx`
  - `src/features/bookshelf/BookCard.tsx`
  - `src/features/bookshelf/importBook.ts`
  - `src/features/bookshelf/extractPackageMetadata.ts`
- `src/features/bookshelf/bookshelfRepository.ts`
- `src/features/bookshelf/bookFileRepository.ts`
  - `src/features/bookshelf/progressRepository.ts`
  - `src/features/bookshelf/hashFile.ts`
  - `src/features/bookshelf/persistImportedBook.ts`
- Reader
  - `src/features/reader/ReaderPage.tsx`
  - `src/features/reader/ReaderPage.test.tsx`
  - `src/features/reader/readerController.ts`
  - `src/features/reader/EpubViewport.tsx`
  - `src/features/reader/EpubViewport.test.tsx`
  - `src/features/reader/selectionBridge.ts`
  - `src/features/reader/TopBar.tsx`
  - `src/features/reader/LeftRail.tsx`
  - `src/features/reader/RightPanel.tsx`
  - `src/features/reader/SelectionPopover.tsx`
  - `src/features/reader/annotationRenderer.ts`
  - `src/features/reader/reader.css`
  - `src/features/reader/panels/AiResultPanel.tsx`
  - `src/features/reader/panels/NoteEditorPanel.tsx`
  - `src/features/reader/panels/TtsStatusPanel.tsx`
  - `src/features/reader/selectionActions.test.tsx`
- Annotations
  - `src/features/annotations/annotationRepository.ts`
  - `src/features/annotations/annotationService.ts`
- AI and TTS
  - `src/features/ai/openaiAdapter.ts`
  - `src/features/ai/aiService.ts`
  - `src/features/ai/OpenAISpikePage.tsx`
  - `src/features/tts/ttsController.ts`
  - `src/features/tts/audioPlayer.ts`
- Settings and PWA
  - `src/features/settings/SettingsDialog.tsx`
  - `src/features/settings/settingsRepository.ts`
  - `src/features/settings/settingsDialog.test.tsx`
  - `src/pwa/registerServiceWorker.ts`
- Feasibility notes
  - `docs/feasibility/openai-browser-spike.md`
- Tests and fixtures
  - `src/app/App.test.tsx`
  - `src/lib/db/appDb.test.ts`
  - `src/features/bookshelf/importBook.test.ts`
  - `src/features/reader/readerController.test.ts`
  - `src/features/annotations/annotationService.test.ts`
  - `src/features/ai/openaiAdapter.test.ts`
  - `src/features/tts/ttsController.test.ts`
  - `tests/e2e/bookshelf.spec.ts`
  - `tests/e2e/ai-actions.spec.ts`
  - `tests/e2e/tts-pwa-security.spec.ts`
  - `tests/e2e/helpers/epubSelection.ts`
  - `tests/fixtures/epub/minimal-valid.epub`
  - `tests/fixtures/epub/missing-cover.epub`
  - `tests/fixtures/epub/blocked-external-resource.epub`
  - `tests/fixtures/epub/unsupported-fixed-layout.epub`

## Chunk 1: Foundation, Storage, and Bookshelf

### Task 1: Bootstrap the React/PWA workspace

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/router.tsx`
- Create: `src/styles/global.css`
- Create: `src/features/bookshelf/BookshelfPage.tsx`
- Create: `src/features/reader/ReaderPage.tsx`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: Initialize git and install dependencies**

```bash
git init
npm init -y
npm install react react-dom react-router-dom dexie epubjs
npm install -D typescript vite @vitejs/plugin-react vite-plugin-pwa vitest jsdom fake-indexeddb @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @types/node @types/react @types/react-dom
npx playwright install chromium
```

Expected: git repository created and npm install completes without interactive prompts.

- [ ] **Step 2: Write the failing app-shell smoke test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

it("renders the bookshelf landing screen", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: /bookshelf/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/app/App.test.tsx`

Expected: FAIL because the app shell and bookshelf route do not exist yet.

- [ ] **Step 4: Implement the minimal app shell**

```tsx
export function App() {
  return <RouterProvider router={router} />;
}

const router = createBrowserRouter([
  { path: "/", element: <BookshelfPage /> },
  { path: "/books/:bookId", element: <ReaderPage /> },
]);

export function BookshelfPage() {
  return <h1>Bookshelf</h1>;
}

export function ReaderPage() {
  return <h1>Reader</h1>;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/App.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts index.html src/main.tsx src/app/App.tsx src/app/router.tsx src/styles/global.css src/features/bookshelf/BookshelfPage.tsx src/features/reader/ReaderPage.tsx src/app/App.test.tsx
git commit -m "feat: scaffold epub reader app shell"
```

### Task 2: Define IndexedDB schema and repositories

**Files:**
- Create: `src/lib/types/books.ts`
- Create: `src/lib/types/annotations.ts`
- Create: `src/lib/types/settings.ts`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/appDb.ts`
- Create: `src/features/bookshelf/bookshelfRepository.ts`
- Create: `src/features/bookshelf/bookFileRepository.ts`
- Create: `src/features/bookshelf/progressRepository.ts`
- Create: `src/features/settings/settingsRepository.ts`
- Test: `src/lib/db/appDb.test.ts`

- [ ] **Step 1: Write the failing database test**

```ts
it("persists imported book blobs, cover cache, settings, and reading progress", async () => {
  await saveBook({
    id: "book-1",
    title: "Demo",
    author: "Author",
    importHash: "hash-1",
    coverThumbnailBlob: new Blob(["cover"], { type: "image/png" }),
  });

  await saveBookFile("book-1", new Blob(["epub-bytes"], { type: "application/epub+zip" }));

  await saveSettings({
    targetLanguage: "zh-CN",
    theme: "sepia",
    apiKey: "test-key",
    ttsVoice: "alloy",
    fontScale: 1.1,
  });

  await saveProgress("book-1", { cfi: "epubcfi(/6/2[chap]!/4/1:0)", progress: 0.2 });

  expect(await getBook("book-1")).toMatchObject({ title: "Demo", author: "Author" });
  expect(await getBookFile("book-1")).toBeInstanceOf(Blob);
  expect(await getSettings()).toMatchObject({ targetLanguage: "zh-CN", ttsVoice: "alloy" });
  expect(await getProgress("book-1")).toMatchObject({ progress: 0.2 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/db/appDb.test.ts`

Expected: FAIL because the schema and repositories do not exist yet.

- [ ] **Step 3: Implement the Dexie schema and repository APIs**

```ts
export class AppDb extends Dexie {
  books!: Table<BookRecord, string>;
  bookFiles!: Table<StoredBookFileRecord, string>;
  progress!: Table<ProgressRecord, string>;
  annotations!: Table<AnnotationRecord, string>;
  settings!: Table<SettingsRecord, string>;

  constructor() {
    super("epub-reader");
    this.version(1).stores({
      books: "id, importHash, title, updatedAt",
      bookFiles: "bookId, updatedAt",
      progress: "bookId, updatedAt",
      annotations: "id, bookId, spineItemId, kind, updatedAt",
      settings: "id",
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/db/appDb.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/books.ts src/lib/types/annotations.ts src/lib/types/settings.ts src/lib/db/schema.ts src/lib/db/appDb.ts src/features/bookshelf/bookshelfRepository.ts src/features/bookshelf/bookFileRepository.ts src/features/bookshelf/progressRepository.ts src/features/settings/settingsRepository.ts src/lib/db/appDb.test.ts
git commit -m "feat: add local persistence schema"
```

### Task 3: Implement EPUB import, duplicate detection, and bookshelf UI

**Files:**
- Create: `src/features/bookshelf/importBook.ts`
- Create: `src/features/bookshelf/extractPackageMetadata.ts`
- Create: `src/features/bookshelf/hashFile.ts`
- Create: `src/features/bookshelf/persistImportedBook.ts`
- Modify: `src/features/bookshelf/BookshelfPage.tsx`
- Create: `src/features/bookshelf/BookCard.tsx`
- Modify: `src/features/bookshelf/bookshelfRepository.ts`
- Create: `src/features/bookshelf/BookshelfPage.test.tsx`
- Create: `tests/fixtures/epub/minimal-valid.epub`
- Create: `tests/fixtures/epub/missing-cover.epub`
- Create: `tests/fixtures/epub/unsupported-fixed-layout.epub`
- Test: `src/features/bookshelf/importBook.test.ts`

- [ ] **Step 1: Write the failing import test**

```ts
it("imports a readable epub, applies metadata fallbacks, and deduplicates by hash", async () => {
  const first = await importBook(minimalValidFile);
  const second = await importBook(minimalValidFile);

  expect(first.title).toBe("Minimal Valid EPUB");
  expect(second.id).toBe(first.id);
  expect(second.lastOpenedAt).not.toBe(first.lastOpenedAt);

  const fallback = await importBook(missingCoverFile);
  expect(fallback.coverUrl).toBeNull();
  expect(fallback.title).toBe("Untitled Book");

  await expect(importBook(unsupportedFile)).rejects.toThrow(/not supported/i);
  expect(await bookshelfRepository.list()).toHaveLength(2);
});
```

```tsx
it("renders imported books with progress and reopens from saved progress", async () => {
  render(<BookshelfPage />);

  expect(await screen.findByText("Minimal Valid EPUB")).toBeInTheDocument();
  expect(screen.getByText("Author")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /minimal valid epub cover/i })).toBeInTheDocument();
  expect(screen.getByText(/20% read/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /minimal valid epub/i })).toHaveAttribute("href", "/books/book-1");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/bookshelf/importBook.test.ts`

Expected: FAIL because import parsing, fallback behavior, and dedupe do not exist yet.

- [ ] **Step 3: Implement the import pipeline and bookshelf screen**

```ts
export async function importBook(file: File): Promise<BookRecord> {
  const importHash = await hashFile(file);
  const existing = await bookshelfRepository.getByHash(importHash);
  if (existing) return existing;

  const metadata = await extractPackageMetadata(file);
  const record = normalizeImportedBook(file, importHash, metadata);
  await persistImportedBook({
    record,
    fileBlob: file,
    coverThumbnailBlob: metadata.coverThumbnailBlob,
  });
  return record;
}
```

```ts
export async function persistImportedBook(input: PersistImportedBookInput) {
  return db.transaction("rw", db.books, db.bookFiles, async () => {
    await bookshelfRepository.save(input.record);
    await bookFileRepository.saveFile(input.record.id, input.fileBlob);
    await bookFileRepository.saveCover(input.record.id, input.coverThumbnailBlob);
  });
}
```

```tsx
export function BookshelfPage() {
  return (
    <main>
      <header>
        <h1>Bookshelf</h1>
        <button>Import EPUB</button>
      </header>
      <section aria-label="Local books">
        <BookCard />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/bookshelf/importBook.test.ts src/features/bookshelf/BookshelfPage.test.tsx src/app/App.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/bookshelf/importBook.ts src/features/bookshelf/extractPackageMetadata.ts src/features/bookshelf/hashFile.ts src/features/bookshelf/persistImportedBook.ts src/features/bookshelf/BookshelfPage.tsx src/features/bookshelf/BookCard.tsx src/features/bookshelf/bookshelfRepository.ts src/features/bookshelf/importBook.test.ts src/features/bookshelf/BookshelfPage.test.tsx tests/fixtures/epub/minimal-valid.epub tests/fixtures/epub/missing-cover.epub tests/fixtures/epub/unsupported-fixed-layout.epub
git commit -m "feat: add local bookshelf import flow"
```

## Chunk 2: Reader Workspace, Annotations, and Bookmarks

### Task 4: Build the paginated reader controller and viewport

**Files:**
- Create: `src/features/reader/readerController.ts`
- Create: `src/features/reader/EpubViewport.tsx`
- Create: `src/features/reader/selectionBridge.ts`
- Create: `src/features/reader/readerController.test.ts`
- Create: `src/features/reader/EpubViewport.test.tsx`
- Modify: `src/lib/types/books.ts`
- Modify: `src/features/bookshelf/bookFileRepository.ts`

- [ ] **Step 1: Write the failing reader-controller test**

```ts
it("opens a stored book, restores the saved CFI, and exposes reader hooks", async () => {
  const controller = createReaderController(fakeBookLoader);
  await controller.open("book-1", "epubcfi(/6/2[chap]!/4/1:0)");

  expect(controller.mode).toBe("paginated");
  expect(controller.currentCfi).toBe("epubcfi(/6/2[chap]!/4/1:0)");
  expect(controller.sandbox).toContain("allow-same-origin");
  expect(await controller.getToc()).toEqual(expect.any(Array));
  expect(controller.goToLocation).toEqual(expect.any(Function));
  expect(controller.observeSelection).toEqual(expect.any(Function));
  expect(controller.observeChapterChanges).toEqual(expect.any(Function));
});
```

```tsx
it("falls back to chapter start when a saved cfi is invalid", async () => {
  render(<EpubViewport initialCfi="epubcfi(invalid)" />);
  expect(await screen.findByText(/opened from chapter start/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/readerController.test.ts src/features/reader/EpubViewport.test.tsx`

Expected: FAIL because the controller and viewport are not implemented.

- [ ] **Step 3: Implement the reader wrapper**

```ts
export function createReaderController(loadBook: LoadBookBlob) {
  let currentCfi = "";
  let book: Book;
  let rendition: Rendition;
  return {
    mode: "paginated" as const,
    sandbox: "allow-same-origin",
    get currentCfi() {
      return currentCfi;
    },
    async open(bookId: string, cfi?: string) {
      const blob = await loadBook(bookId);
      book = ePub(await blob.arrayBuffer());
      rendition = book.renderTo("epub-root", {
        flow: "paginated",
        allowScriptedContent: false,
      });
      await rendition.display(cfi);
      currentCfi = cfi ?? "";
      return { book, rendition };
    },
    getToc() {
      return book.loaded.navigation.then((nav) => nav.toc);
    },
    goToLocation(nextCfi: string) {
      currentCfi = nextCfi;
      return rendition.display(nextCfi);
    },
    observeSelection(cb: SelectionHandler) {
      return selectionBridge.subscribe(cb);
    },
    observeChapterChanges(cb: ChapterHandler) {
      return rendition.on("relocated", cb);
    },
  };
}
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/reader/readerController.test.ts src/features/reader/EpubViewport.test.tsx src/features/bookshelf/importBook.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/readerController.ts src/features/reader/EpubViewport.tsx src/features/reader/selectionBridge.ts src/features/reader/readerController.test.ts src/features/reader/EpubViewport.test.tsx src/lib/types/books.ts src/features/bookshelf/bookFileRepository.ts
git commit -m "feat: add paginated epub reader controller"
```

### Task 5: Build the reading workspace shell and selection popover

**Files:**
- Modify: `src/features/reader/ReaderPage.tsx`
- Create: `src/features/reader/reader.css`
- Create: `src/features/reader/TopBar.tsx`
- Create: `src/features/reader/LeftRail.tsx`
- Create: `src/features/reader/RightPanel.tsx`
- Create: `src/features/reader/panels/AiResultPanel.tsx`
- Create: `src/features/reader/panels/NoteEditorPanel.tsx`
- Create: `src/features/reader/panels/TtsStatusPanel.tsx`
- Create: `src/features/reader/SelectionPopover.tsx`
- Test: `src/features/reader/ReaderPage.test.tsx`

- [ ] **Step 1: Write the failing workspace test**

```tsx
it("shows toc, reading progress, bookmark toggle, and the reader tools surface", () => {
  render(<ReaderPage />);

  expect(screen.getByRole("navigation", { name: /table of contents/i })).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: /reading progress/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bookmark this location/i })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: /reader tools/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because the reader workspace shell does not exist yet.

- [ ] **Step 3: Implement the desktop reader layout**

```tsx
export function ReaderPage() {
  return (
    <main className="reader-layout">
      <LeftRail />
      <section className="reader-center">
        <TopBar />
        <EpubViewport />
        <SelectionPopover />
      </section>
      <RightPanel aria-label="Reader tools" />
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/reader/ReaderPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/ReaderPage.tsx src/features/reader/reader.css src/features/reader/TopBar.tsx src/features/reader/LeftRail.tsx src/features/reader/RightPanel.tsx src/features/reader/panels/AiResultPanel.tsx src/features/reader/panels/NoteEditorPanel.tsx src/features/reader/panels/TtsStatusPanel.tsx src/features/reader/SelectionPopover.tsx src/features/reader/ReaderPage.test.tsx
git commit -m "feat: add reader workspace shell"
```

### Task 6: Implement bookmarks, highlights, notes, and annotation replay

**Files:**
- Create: `src/features/annotations/annotationRepository.ts`
- Create: `src/features/annotations/annotationService.ts`
- Create: `src/features/reader/annotationRenderer.ts`
- Modify: `src/lib/types/annotations.ts`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/EpubViewport.tsx`
- Modify: `src/features/reader/TopBar.tsx`
- Modify: `src/features/reader/LeftRail.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Test: `src/features/annotations/annotationService.test.ts`

- [ ] **Step 1: Write the failing annotation test**

```ts
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
  const note = await annotationService.createNote({ ...highlight, body: "Remember this sentence" });

  expect(bookmark.id).toBeTruthy();
  expect(note.body).toBe("Remember this sentence");
  expect(await annotationService.queryVisible("book-1", "chap-1")).toHaveLength(3);
  await annotationService.removeBookmark(bookmark.id);
  expect(await annotationService.listByBook("book-1")).toHaveLength(2);
  expect(await annotationService.queryVisible("book-1", "chap-1")).toHaveLength(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/annotations/annotationService.test.ts`

Expected: FAIL because annotation records and replay logic do not exist yet.

- [ ] **Step 3: Implement persistence and replay**

```ts
export type NoteRecord = {
  id: string;
  bookId: string;
  spineItemId: string;
  startCfi: string;
  endCfi: string;
  textQuote: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};
```

```ts
export const annotationService = {
  createBookmark(bookId: string, spineItemId: string, cfi: string) {
    return annotationRepository.insertBookmark({ id: crypto.randomUUID(), bookId, spineItemId, cfi });
  },
  createHighlight(input: HighlightInput) {
    return annotationRepository.insertHighlight({ id: crypto.randomUUID(), ...input });
  },
  createNote(input: NoteInput) {
    return annotationRepository.insertNote({ id: crypto.randomUUID(), ...input });
  },
  removeBookmark(id: string) {
    return annotationRepository.remove(id);
  },
  queryVisible(bookId: string, spineItemId: string) {
    return annotationRepository.queryBySpineItem(bookId, spineItemId);
  },
  listByBook(bookId: string) {
    return annotationRepository.listByBook(bookId);
  },
  updateNote(id: string, body: string) {
    return annotationRepository.updateBody(id, body);
  },
};
```

```ts
const visibleAnnotations = await annotationService.queryVisible(bookId, spineItemId);
annotationRenderer.clear();
annotationRenderer.paint(visibleAnnotations);
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/annotations/annotationService.test.ts src/features/reader/ReaderPage.test.tsx src/features/reader/EpubViewport.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/annotations/annotationRepository.ts src/features/annotations/annotationService.ts src/features/reader/annotationRenderer.ts src/lib/types/annotations.ts src/features/reader/ReaderPage.tsx src/features/reader/EpubViewport.tsx src/features/reader/TopBar.tsx src/features/reader/LeftRail.tsx src/features/reader/RightPanel.tsx src/features/annotations/annotationService.test.ts
git commit -m "feat: add bookmarks notes and highlights"
```

## Chunk 3: OpenAI Integration, TTS, PWA, and Verification

### Task 7: Validate the browser-to-OpenAI contract and implement the adapter

**Execution order note:** Run this task immediately after Task 1 and before Tasks 2-10. It is the go/no-go gate for keeping AI features in scope.

**Files:**
- Create: `src/features/ai/openaiAdapter.ts`
- Create: `src/features/ai/aiService.ts`
- Create: `src/features/ai/OpenAISpikePage.tsx`
- Create: `src/features/tts/audioPlayer.ts`
- Create: `src/features/ai/openaiAdapter.test.ts`
- Create: `docs/feasibility/openai-browser-spike.md`
- Modify: `src/app/router.tsx`

- [ ] **Step 1: Write the failing adapter test**

```ts
it("normalizes translation, explanation, speech, aborts, and provider errors through one OpenAI contract", async () => {
  const adapter = createOpenAIAdapter({ apiKey: "test-key", fetch: fakeFetch });

  await adapter.translateSelection("hola", { targetLanguage: "en" });
  await adapter.explainSelection("ephemeral", { targetLanguage: "zh-CN" });
  await adapter.synthesizeSpeech("hello world", { voice: "alloy" });
  await adapter.translateSelection("hola", { targetLanguage: "en", signal: abortController.signal });

  expect(fakeFetch).toHaveBeenCalledTimes(4);
  expect(normalizeOpenAIError(authFailure)).toEqual({ kind: "auth" });
  expect(normalizeOpenAIError(corsFailure)).toEqual({ kind: "network-or-cors" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/ai/openaiAdapter.test.ts`

Expected: FAIL because the adapter contract and OpenAI endpoints are not implemented.

- [ ] **Step 3: Implement the adapter and the browser-only spike page**

```ts
export function createOpenAIAdapter(deps: OpenAIDeps) {
  return {
    translateSelection(text: string, context: TranslateContext) {
      return deps.fetchText({ kind: "translate", text, context });
    },
    explainSelection(text: string, context: ExplainContext) {
      return deps.fetchText({ kind: "explain", text, context });
    },
    synthesizeSpeech(text: string, options: VoiceOptions) {
      return deps.fetchSpeech({ text, voice: options.voice });
    },
  };
}
```

- [ ] **Step 4: Run automated tests and the manual spike**

Run: `npx vitest run src/features/ai/openaiAdapter.test.ts`

Expected: PASS

Run: `npm run dev`

Manual check:
- open `/spike/openai`
- enter a real API key
- confirm one translate request succeeds
- confirm one explain request succeeds
- confirm one speech request returns playable audio
- confirm the returned audio plays through the shared app player path
- document observed auth, error, and CORS behavior in the spike notes
- record exact request/response notes in `docs/feasibility/openai-browser-spike.md`

Expected: all three browser-side checks succeed in Chromium. If any fail, stop the plan and remove AI scope instead of continuing with Tasks 8-10.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/openaiAdapter.ts src/features/ai/aiService.ts src/features/ai/OpenAISpikePage.tsx src/features/tts/audioPlayer.ts src/features/ai/openaiAdapter.test.ts docs/feasibility/openai-browser-spike.md src/app/router.tsx
git commit -m "feat: validate and add openai browser adapter"
```

### Task 8: Wire settings, selection actions, note editing, and instant read-aloud

**Files:**
- Modify: `src/features/reader/SelectionPopover.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/ai/aiService.ts`
- Create: `src/features/settings/SettingsDialog.tsx`
- Create: `src/features/settings/settingsDialog.test.tsx`
- Modify: `src/features/settings/settingsRepository.ts`
- Modify: `src/features/reader/panels/AiResultPanel.tsx`
- Modify: `src/features/reader/panels/NoteEditorPanel.tsx`
- Create: `src/features/reader/selectionActions.test.tsx`

- [ ] **Step 1: Write the failing interaction test**

```tsx
it("routes selection actions to note editing and read-aloud, and interrupts stale ai requests", async () => {
  render(<ReaderPage />);

  await user.click(screen.getByRole("button", { name: /translate/i }));
  await user.click(screen.getByRole("button", { name: /explain/i }));
  await user.click(screen.getByRole("button", { name: /add note/i }));
  await user.click(screen.getByRole("button", { name: /read aloud/i }));

  expect(cancelPreviousRequest).toHaveBeenCalled();
  expect(screen.getByRole("region", { name: /ai result/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /note body/i })).toBeInTheDocument();
  expect(stopPreviousTtsSession).toHaveBeenCalled();
});
```

```tsx
it("persists api key target language and tts preferences in settings", async () => {
  render(<SettingsDialog />);

  await user.type(screen.getByLabelText(/api key/i), "sk-test");
  await user.selectOptions(screen.getByLabelText(/target language/i), "zh-CN");
  await user.selectOptions(screen.getByLabelText(/voice/i), "alloy");
  await user.click(screen.getByRole("button", { name: /save settings/i }));

  expect(await settingsRepository.get()).toMatchObject({
    apiKey: "sk-test",
    targetLanguage: "zh-CN",
    ttsVoice: "alloy",
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/settings/settingsDialog.test.tsx`

Expected: FAIL because selection actions are not wired to AI services and right-panel state yet.

- [ ] **Step 3: Implement settings persistence and right-panel action routing**

```ts
switch (action.kind) {
  case "translate":
    return aiService.translateSelection(selectionText, context);
  case "explain":
    return aiService.explainSelection(selectionText, context);
  case "note":
    return rightPanel.openNoteEditor(selectionRange);
  case "read-aloud":
    return ttsController.playSelection(selectionText);
}
```

```ts
export async function saveSettings(input: SettingsInput) {
  return settingsRepository.save({
    ...input,
    targetLanguage: input.targetLanguage ?? navigator.language,
  });
}
```

```tsx
<p className="settings-disclosure">AI requests are sent directly from this browser to OpenAI.</p>
<AiResultPanel error={aiError} />
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/reader/selectionActions.test.tsx src/features/settings/settingsDialog.test.tsx src/features/annotations/annotationService.test.ts src/features/ai/openaiAdapter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/reader/SelectionPopover.tsx src/features/reader/RightPanel.tsx src/features/reader/ReaderPage.tsx src/features/ai/aiService.ts src/features/settings/SettingsDialog.tsx src/features/settings/settingsDialog.test.tsx src/features/settings/settingsRepository.ts src/features/reader/panels/AiResultPanel.tsx src/features/reader/panels/NoteEditorPanel.tsx src/features/reader/selectionActions.test.tsx
git commit -m "feat: wire settings and reader selection actions"
```

### Task 9: Implement continuous TTS lifecycle and shared player behavior

**Files:**
- Create: `src/features/tts/ttsController.ts`
- Modify: `src/features/reader/TopBar.tsx`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/RightPanel.tsx`
- Modify: `src/features/reader/panels/TtsStatusPanel.tsx`
- Modify: `src/features/reader/readerController.ts`
- Test: `src/features/tts/ttsController.test.ts`

- [ ] **Step 1: Write the failing TTS-controller test**

```ts
it("plays from the current paragraph, updates progress, pauses, resumes, stops on reflow, and retries only the failed chunk", async () => {
  const controller = createTtsController(fakeReader, fakeSpeech, fakePlayer);

  await controller.playFromCurrentParagraph();
  await controller.pause();
  await controller.resume();
  controller.handleTypographyReflow();
  controller.handleManualNavigation();
  await controller.retryFailedChunk();

  expect(fakePlayer.stop).toHaveBeenCalled();
  expect(fakePlayer.pause).toHaveBeenCalled();
  expect(fakePlayer.resume).toHaveBeenCalled();
  expect(fakeSpeech.synthesize).toHaveBeenCalled();
  expect(saveProgress).toHaveBeenCalled();
  expect(syncActiveAnchor).toHaveBeenCalled();
  expect(fallbackToSelectionReadAloud).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/tts/ttsController.test.ts`

Expected: FAIL because queue slicing, interruption, and retry behavior are not implemented.

- [ ] **Step 3: Implement the shared player and lifecycle rules**

```ts
export function createTtsController(reader: ReaderApi, ai: SpeechApi, player: AudioPlayer) {
  return {
    async playFromCurrentParagraph() {
      const queue = await reader.buildSpeechQueueFromCurrentParagraph();
      return playQueue(queue);
    },
    pause() {
      return player.pause();
    },
    resume() {
      return player.resume();
    },
    handleManualNavigation() {
      player.stop();
      clearActiveQueue();
    },
    handleTypographyReflow() {
      player.stop();
      clearActiveQueue();
    },
    retryFailedChunk() {
      return replayFailedChunkOnly();
    },
  };
}
```

```ts
export function buildSpeechQueueFromCurrentParagraph(anchor: ReaderAnchor) {
  const paragraph = findNearestReadableBlock(anchor);
  return sliceParagraphsToChapterEnd(paragraph);
}
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/tts/ttsController.test.ts src/features/reader/selectionActions.test.tsx src/features/settings/settingsDialog.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tts/ttsController.ts src/features/reader/readerController.ts src/features/reader/TopBar.tsx src/features/reader/ReaderPage.tsx src/features/reader/RightPanel.tsx src/features/reader/panels/TtsStatusPanel.tsx src/features/tts/ttsController.test.ts
git commit -m "feat: add continuous tts controller"
```

### Task 10: Finish PWA, security edges, delete-book flow, and end-to-end verification

**Files:**
- Create: `src/pwa/registerServiceWorker.ts`
- Modify: `vite.config.ts`
- Modify: `src/main.tsx`
- Modify: `src/features/bookshelf/BookshelfPage.tsx`
- Modify: `src/features/bookshelf/bookshelfRepository.ts`
- Modify: `src/features/bookshelf/bookFileRepository.ts`
- Modify: `src/features/reader/EpubViewport.tsx`
- Create: `tests/e2e/bookshelf.spec.ts`
- Create: `tests/e2e/ai-actions.spec.ts`
- Create: `tests/e2e/tts-pwa-security.spec.ts`
- Create: `tests/e2e/helpers/epubSelection.ts`
- Create: `public/pwa-192.png`
- Create: `public/pwa-512.png`
- Create: `tests/fixtures/epub/blocked-external-resource.epub`
- Create: `tests/fixtures/epub/unsupported-fixed-layout.epub`

- [ ] **Step 1: Write the failing end-to-end test**

```ts
test("bookshelf flow imports, reopens, and deletes a book", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /import epub/i }).click();
  await page.getByText("Minimal Valid EPUB").click();
  await expect(page.getByRole("button", { name: /bookmark this location/i })).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: /delete book/i }).click();
  await expect(page.getByText("Minimal Valid EPUB")).not.toBeVisible();
});
```

```ts
test("ai actions translate explain and read selected text aloud", async ({ page }) => {
  await page.goto("/books/book-1");
  await selectTextInIframe(page, "Hello world");
  await page.getByRole("button", { name: /translate/i }).click();
  await page.getByRole("button", { name: /explain/i }).click();
  await page.getByRole("button", { name: /read aloud/i }).click();
});
```

```ts
test("tts pwa and security edges behave correctly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /import epub/i }).click();
  await page.getByText("unsupported-fixed-layout.epub is not supported").waitFor();
  await page.goto("/books/book-1");
  await page.getByRole("button", { name: /play chapter tts/i }).click();
  await page.getByRole("button", { name: /increase font size/i }).click();
  await expect(page.getByText(/tts stopped because layout changed/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/bookshelf.spec.ts tests/e2e/ai-actions.spec.ts tests/e2e/tts-pwa-security.spec.ts`

Expected: FAIL because the full user journey and fixtures are not complete yet.

- [ ] **Step 3: Implement the remaining integration edges**

```ts
export async function deleteBook(bookId: string) {
  await db.transaction("rw", db.books, db.bookFiles, db.progress, db.annotations, async () => {
    await db.books.delete(bookId);
    await db.bookFiles.delete(bookId);
    await db.progress.delete(bookId);
    await db.annotations.where("bookId").equals(bookId).delete();
  });
}
```

```ts
registerSW({
  immediate: true,
  onOfflineReady() {
    console.info("PWA offline cache ready");
  },
});
```

```ts
import { registerServiceWorker } from "./pwa/registerServiceWorker";

registerServiceWorker();
```

- [ ] **Step 4: Run the full verification suite**

Run: `npx vitest run`

Expected: PASS

Run: `npx playwright test`

Expected: PASS

Manual checks:
- install the PWA from Chromium
- close and relaunch the installed PWA and confirm it reopens into the bookshelf
- import `blocked-external-resource.epub` and confirm external resources are blocked
- inspect the reader iframe and confirm sandbox restrictions are present
- click an external link inside book content and confirm the app asks before opening a new tab
- change font size during active TTS and confirm playback stops immediately
- simulate a quota failure and confirm the app surfaces a storage warning without corrupting existing books

Expected: all manual checks pass.

- [ ] **Step 5: Commit**

```bash
git add src/pwa/registerServiceWorker.ts src/main.tsx vite.config.ts src/features/bookshelf/BookshelfPage.tsx src/features/bookshelf/bookshelfRepository.ts src/features/bookshelf/bookFileRepository.ts src/features/reader/EpubViewport.tsx tests/e2e/bookshelf.spec.ts tests/e2e/ai-actions.spec.ts tests/e2e/tts-pwa-security.spec.ts tests/e2e/helpers/epubSelection.ts public/pwa-192.png public/pwa-512.png tests/fixtures/epub/blocked-external-resource.epub tests/fixtures/epub/unsupported-fixed-layout.epub
git commit -m "feat: finish pwa security and verification"
```
