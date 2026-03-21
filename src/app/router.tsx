import { useRoutes } from "react-router-dom";
import { ReaderAppShell } from "./ReaderAppShell";
import { OpenAISpikePage } from "../features/ai/OpenAISpikePage";
import { BookshelfPage } from "../features/bookshelf/BookshelfPage";
import { ReaderPage } from "../features/reader/ReaderPage";

const routes = [
  {
    path: "/",
    element: <ReaderAppShell />,
    children: [
      {
        index: true,
        element: <BookshelfPage />,
      },
      {
        path: "books/:bookId",
        element: <ReaderPage />,
      },
    ],
  },
  {
    path: "/spike/openai",
    element: <OpenAISpikePage />,
  },
];

export function AppRouter() {
  return useRoutes(routes);
}
