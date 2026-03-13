import { useRoutes } from "react-router-dom";
import { BookshelfPage } from "../features/bookshelf/BookshelfPage";
import { ReaderPage } from "../features/reader/ReaderPage";

const routes = [
  {
    path: "/",
    element: <BookshelfPage />,
  },
  {
    path: "/books/:bookId",
    element: <ReaderPage />,
  },
];

export function AppRouter() {
  return useRoutes(routes);
}
