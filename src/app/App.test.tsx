import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

it("renders the bookshelf landing screen", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: /bookshelf/i })).toBeInTheDocument();
});
