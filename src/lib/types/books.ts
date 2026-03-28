export type BookRecord = {
  id: string;
  title: string;
  author: string;
  importHash: string;
  coverThumbnailBlob: Blob | null;
};

export type StoredBookFileRecord = {
  bookId: string;
  file: Blob;
};

export type ProgressRecord = {
  bookId: string;
  cfi: string;
  pageIndex?: number;
  pageOffset?: number;
  progress: number;
  scrollTop?: number;
  spineItemId?: string;
  textQuote?: string;
  updatedAt?: number;
};

export type TocItem = {
  children?: TocItem[];
  id: string;
  label: string;
  target?: string;
};

export type ChapterChange = {
  cfi: string;
};

export type BookshelfListItem = {
  id: string;
  title: string;
  author: string;
  lastReadAt?: number;
  progressLabel: string;
};
