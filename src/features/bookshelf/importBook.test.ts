import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { getBook, saveBookFile } from "./bookshelfRepository";
import { importBook } from "./importBook";
import { resetDb } from "../../lib/db/appDb";

async function loadFixture(name: string) {
  const buffer = await readFile(resolve("tests/fixtures/epub", name));
  return new File([buffer], name, { type: "application/epub+zip" });
}

afterEach(async () => {
  await resetDb();
});

it("imports a readable epub, applies metadata fallbacks, and deduplicates by hash", async () => {
  const minimalValidFile = await loadFixture("minimal-valid.epub");
  const missingCoverFile = await loadFixture("missing-cover.epub");

  const first = await importBook(minimalValidFile);
  const second = await importBook(minimalValidFile);

  expect(first.title).toBe("Minimal Valid EPUB");
  expect(first.author).toBe("Author");
  expect(second.id).toBe(first.id);

  const fallback = await importBook(missingCoverFile);
  expect(fallback.title).toBe("Untitled Book");
  expect(fallback.author).toBe("Unknown Author");

  const storedBook = await getBook(first.id);
  expect(storedBook?.title).toBe("Minimal Valid EPUB");
});

it("still imports epubs when subtle crypto is unavailable", async () => {
  const minimalValidFile = await loadFixture("minimal-valid.epub");
  const originalCrypto = globalThis.crypto;

  vi.stubGlobal("crypto", {
    ...originalCrypto,
    subtle: undefined,
  });

  try {
    const imported = await importBook(minimalValidFile);
    expect(imported.title).toBe("Minimal Valid EPUB");
    expect(imported.id.length).toBeGreaterThan(10);
  } finally {
    vi.stubGlobal("crypto", originalCrypto);
  }
});
