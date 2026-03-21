import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

it("renders the shared app shell on the bookshelf route", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );

  const banner = screen.getByRole("banner", { name: /reader app navigation/i });
  expect(banner).toBeInTheDocument();
  expect(within(banner).getByRole("button", { name: /library/i })).toBeInTheDocument();
  expect(within(banner).getByRole("button", { name: /import epub/i })).toBeInTheDocument();
  expect(within(banner).getByRole("button", { name: /settings/i })).toBeInTheDocument();
});

it("renders the shared app shell on the reader route", () => {
  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <App />
    </MemoryRouter>,
  );

  const banner = screen.getByRole("banner", { name: /reader app navigation/i });
  expect(banner).toBeInTheDocument();
  expect(within(banner).getByRole("button", { name: /library/i })).toBeInTheDocument();
  expect(within(banner).getByRole("button", { name: /import epub/i })).toBeInTheDocument();
  expect(within(banner).getByRole("button", { name: /settings/i })).toBeInTheDocument();
});
