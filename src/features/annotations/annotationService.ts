import type {
  HighlightInput,
  HighlightRecord,
  NoteInput,
  NoteRecord,
} from "../../lib/types/annotations";
import { annotationRepository } from "./annotationRepository";

function timestamp() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

export const annotationService = {
  createBookmark(bookId: string, spineItemId: string, cfi: string) {
    const now = timestamp();

    return annotationRepository.insertBookmark({
      id: createId(),
      bookId,
      spineItemId,
      kind: "bookmark",
      cfi,
      createdAt: now,
      updatedAt: now,
    });
  },
  createHighlight(input: HighlightInput): Promise<HighlightRecord> {
    const now = timestamp();
    const { bookId, spineItemId, startCfi, endCfi, textQuote, color } = input;

    return annotationRepository.insertHighlight({
      id: createId(),
      kind: "highlight",
      createdAt: now,
      updatedAt: now,
      bookId,
      spineItemId,
      startCfi,
      endCfi,
      textQuote,
      color,
    });
  },
  createNote(input: NoteInput): Promise<NoteRecord> {
    const now = timestamp();
    const { bookId, spineItemId, startCfi, endCfi, textQuote, color, body } = input;

    return annotationRepository.insertNote({
      id: createId(),
      kind: "note",
      createdAt: now,
      updatedAt: now,
      bookId,
      spineItemId,
      startCfi,
      endCfi,
      textQuote,
      color,
      body,
    });
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
