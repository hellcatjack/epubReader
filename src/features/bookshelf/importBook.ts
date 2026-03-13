import { createHash } from "node:crypto";
import type { BookRecord } from "../../lib/types/books";
import {
  getBookByHash,
  saveBook,
  saveBookFile,
} from "./bookshelfRepository";
import { extractPackageMetadata } from "./extractPackageMetadata";

async function hashFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeBookRecord(
  file: File,
  importHash: string,
  metadata: Awaited<ReturnType<typeof extractPackageMetadata>>,
): BookRecord {
  return {
    id: importHash,
    title: metadata.title?.trim() || "Untitled Book",
    author: metadata.author?.trim() || "Unknown Author",
    importHash,
    coverThumbnailBlob: metadata.coverThumbnailBlob,
  };
}

export async function importBook(file: File) {
  const importHash = await hashFile(file);
  const existing = await getBookByHash(importHash);
  if (existing) {
    return existing;
  }

  const metadata = await extractPackageMetadata(file);
  const record = normalizeBookRecord(file, importHash, metadata);

  await saveBook(record);
  await saveBookFile(record.id, file);

  return record;
}
