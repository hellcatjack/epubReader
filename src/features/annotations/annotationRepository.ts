import { db } from "../../lib/db/appDb";
import type {
  AnnotationRecord,
  BookmarkRecord,
  HighlightRecord,
  NoteRecord,
} from "../../lib/types/annotations";

async function insertTyped<T extends AnnotationRecord>(record: T) {
  await db.annotations.put(record);
  return record;
}

export const annotationRepository = {
  insertBookmark(record: BookmarkRecord) {
    return insertTyped(record);
  },
  insertHighlight(record: HighlightRecord) {
    return insertTyped(record);
  },
  insertNote(record: NoteRecord) {
    return insertTyped(record);
  },
  async remove(id: string) {
    await db.annotations.delete(id);
  },
  async queryBySpineItem(bookId: string, spineItemId: string) {
    const annotations = await db.annotations
      .where("bookId")
      .equals(bookId)
      .filter((annotation) => annotation.spineItemId === spineItemId)
      .sortBy("updatedAt");

    return annotations;
  },
  async listByBook(bookId: string) {
    return db.annotations.where("bookId").equals(bookId).sortBy("updatedAt");
  },
  async updateBody(id: string, body: string) {
    const record = await db.annotations.get(id);

    if (!record || record.kind !== "note") {
      return null;
    }

    const updatedRecord: NoteRecord = {
      ...record,
      body,
      updatedAt: new Date().toISOString(),
    };

    await db.annotations.put(updatedRecord);
    return updatedRecord;
  },
};
