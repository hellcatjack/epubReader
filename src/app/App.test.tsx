import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

const { usePwaStatusMock } = vi.hoisted(() => ({
  usePwaStatusMock: vi.fn(() => ({
    applyUpdate: vi.fn(async () => undefined),
    updateAvailable: false,
  })),
}));

vi.mock("virtual:pwa-register", () => ({
  registerSW: vi.fn(),
}));

vi.mock("../pwa/usePwaStatus", () => ({
  usePwaStatus: () => usePwaStatusMock(),
}));

vi.mock("../features/settings/resetLocalAppState", () => ({
  resetLocalAppState: vi.fn(async () => undefined),
}));

import { App } from "./App";

it("renders the shared app shell on the bookshelf route", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );

  const navigation = screen.getByRole("navigation", { name: /reader app navigation/i });
  expect(navigation).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /library/i })).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /import epub/i })).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /settings/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /local books/i })).toBeInTheDocument();
});

it("renders reader-route shell actions inside the top bar instead of a separate shell header", () => {
  render(
    <MemoryRouter initialEntries={["/books/book-1"]}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.queryByRole("navigation", { name: /reader app navigation/i })).not.toBeInTheDocument();
  const topbar = screen.getByRole("banner");
  expect(within(topbar).getByRole("button", { name: /library/i })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: /import epub/i })).toBeInTheDocument();
  expect(within(topbar).getByRole("button", { name: /settings/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /preparing your book/i })).toBeInTheDocument();
});

it("does not expose the obsolete local translation spike route", () => {
  const { container } = render(
    <MemoryRouter initialEntries={["/spike/openai"]}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.queryByRole("heading", { name: /local translation spike/i })).not.toBeInTheDocument();
  expect(container).toBeEmptyDOMElement();
});

it("shows a reload banner when a new version is ready", () => {
  usePwaStatusMock.mockReturnValue({
    applyUpdate: vi.fn(async () => undefined),
    updateAvailable: true,
  });

  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByText(/a new version is ready/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reload now/i })).toBeInTheDocument();

  usePwaStatusMock.mockReturnValue({
    applyUpdate: vi.fn(async () => undefined),
    updateAvailable: false,
  });
});
