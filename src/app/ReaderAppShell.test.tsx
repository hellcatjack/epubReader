import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReaderAppShell } from "./ReaderAppShell";

function ShellOutletStub() {
  return <p>Shell outlet content</p>;
}

it("renders the shared shell navigation and outlet content", () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<ReaderAppShell />}>
          <Route index element={<ShellOutletStub />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  const navigation = screen.getByRole("navigation", { name: /reader app navigation/i });
  expect(navigation).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /library/i })).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /import epub/i })).toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: /settings/i })).toBeInTheDocument();
  expect(screen.getByText("Shell outlet content")).toBeInTheDocument();
});
