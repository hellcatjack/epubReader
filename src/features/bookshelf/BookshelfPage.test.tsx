import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookshelfPage } from "./BookshelfPage";

it("renders imported books with progress and reopens from saved progress", async () => {
  render(
    <MemoryRouter>
      <BookshelfPage
        books={[
          {
            id: "book-1",
            title: "Minimal Valid EPUB",
            author: "Author",
            progressLabel: "20% read",
          },
        ]}
      />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Minimal Valid EPUB")).toBeInTheDocument();
  expect(screen.getByText("Author")).toBeInTheDocument();
  expect(screen.getByText("20% read")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /minimal valid epub/i })).toHaveAttribute(
    "href",
    "/books/book-1",
  );
});
