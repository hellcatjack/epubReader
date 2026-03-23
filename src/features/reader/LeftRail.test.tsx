import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeftRail } from "./LeftRail";

it("keeps nested table-of-contents children collapsed by default and expands them on demand", async () => {
  const user = userEvent.setup();

  render(
    <LeftRail
      onNavigateToTocItem={() => undefined}
      toc={
        [
          {
            id: "genesis",
            label: "Genesis",
            target: "genesis.xhtml#book",
            children: [
              { id: "genesis-1", label: "Chapter 1", target: "genesis.xhtml#c1" },
              { id: "genesis-12", label: "Chapter 12", target: "genesis.xhtml#c12" },
            ],
          },
          {
            id: "exodus",
            label: "Exodus",
            target: "exodus.xhtml#book",
          },
        ] as never
      }
    />,
  );

  expect(screen.getByRole("button", { name: "Genesis" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Chapter 12" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /expand genesis/i }));

  expect(screen.getByRole("button", { name: "Chapter 12" })).toBeInTheDocument();
});

it("auto-expands the branch that contains the current reading location", () => {
  render(
    <LeftRail
      currentSpineItemId="genesis.xhtml"
      onNavigateToTocItem={() => undefined}
      toc={
        [
          {
            id: "genesis",
            label: "Genesis",
            target: "genesis.xhtml#book",
            children: [
              { id: "genesis-1", label: "Chapter 1", target: "genesis.xhtml#c1" },
              { id: "genesis-2", label: "Chapter 2", target: "genesis.xhtml#c2" },
            ],
          },
        ] as never
      }
    />,
  );

  expect(screen.getByRole("button", { name: "Chapter 2" })).toBeInTheDocument();
});

it("lets the user collapse the active reading branch without losing the current section highlight", async () => {
  const user = userEvent.setup();

  render(
    <LeftRail
      currentSpineItemId="genesis.xhtml"
      onNavigateToTocItem={() => undefined}
      toc={
        [
          {
            id: "genesis",
            label: "Genesis",
            target: "genesis.xhtml#book",
            children: [
              { id: "genesis-1", label: "Chapter 1", target: "genesis.xhtml#c1" },
              { id: "genesis-2", label: "Chapter 2", target: "genesis.xhtml#c2" },
            ],
          },
        ] as never
      }
    />,
  );

  expect(screen.getByRole("button", { name: "Chapter 1" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /collapse genesis/i }));

  expect(screen.queryByRole("button", { name: "Chapter 1" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /expand genesis/i })).toBeInTheDocument();
});

it("filters the toc by ancestor and child labels for fast long-book lookup", async () => {
  const user = userEvent.setup();

  render(
    <LeftRail
      onNavigateToTocItem={() => undefined}
      toc={
        [
          {
            id: "genesis",
            label: "Genesis",
            target: "genesis.xhtml#book",
            children: [
              { id: "genesis-12", label: "Chapter 12", target: "genesis.xhtml#c12" },
            ],
          },
          {
            id: "romans",
            label: "Romans",
            target: "romans.xhtml#book",
            children: [
              { id: "romans-8", label: "Chapter 8", target: "romans.xhtml#c8" },
            ],
          },
        ] as never
      }
    />,
  );

  await user.type(screen.getByRole("searchbox", { name: /search contents/i }), "genesis 12");

  expect(screen.getByRole("button", { name: "Chapter 12" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Romans" })).not.toBeInTheDocument();
});

it("matches chapter numbers exactly so john 3 does not surface chapter 13", async () => {
  const user = userEvent.setup();

  render(
    <LeftRail
      onNavigateToTocItem={() => undefined}
      toc={
        [
          {
            id: "john",
            label: "JOHN",
            target: "john.xhtml#book",
            children: [
              { id: "john-3", label: "Chapter 3", target: "john.xhtml#c3" },
              { id: "john-13", label: "Chapter 13", target: "john.xhtml#c13" },
            ],
          },
          {
            id: "third-john",
            label: "3 JOHN",
            target: "3john.xhtml#book",
          },
          {
            id: "first-john",
            label: "1 JOHN",
            target: "1john.xhtml#book",
            children: [{ id: "first-john-3", label: "Chapter 3", target: "1john.xhtml#c3" }],
          },
        ] as never
      }
    />,
  );

  await user.type(screen.getByRole("searchbox", { name: /search contents/i }), "john 3");

  expect(screen.getByRole("button", { name: "Chapter 3" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Chapter 13" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "3 JOHN" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "1 JOHN" })).not.toBeInTheDocument();
});
