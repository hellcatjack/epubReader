export type HighlightColor = "amber" | "sage" | "ocean";

type AnnotationBase = {
  id: string;
  bookId: string;
  spineItemId: string;
  createdAt: string;
  updatedAt: string;
};

export type BookmarkRecord = AnnotationBase & {
  kind: "bookmark";
  cfi: string;
};

export type HighlightRecord = AnnotationBase & {
  kind: "highlight";
  startCfi: string;
  endCfi: string;
  textQuote: string;
  color: HighlightColor;
};

export type NoteRecord = AnnotationBase & {
  kind: "note";
  startCfi: string;
  endCfi: string;
  textQuote: string;
  color: HighlightColor;
  body: string;
};

export type AnnotationRecord = BookmarkRecord | HighlightRecord | NoteRecord;

export type HighlightInput = {
  bookId: string;
  spineItemId: string;
  startCfi: string;
  endCfi: string;
  textQuote: string;
  color: HighlightColor;
};

export type NoteInput = HighlightInput & {
  body: string;
};
