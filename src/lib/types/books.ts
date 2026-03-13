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
  progress: number;
};

export type BookshelfListItem = {
  id: string;
  title: string;
  author: string;
  progressLabel: string;
};
