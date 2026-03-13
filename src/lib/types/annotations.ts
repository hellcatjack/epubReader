export type AnnotationRecord = {
  id: string;
  bookId: string;
  spineItemId: string;
  kind: "bookmark" | "highlight" | "note";
  updatedAt: string;
};
