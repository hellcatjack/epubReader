import { describe, expect, it } from "vitest";
import { findTocPathBySpineItemId } from "./tocTree";

describe("tocTree", () => {
  it("prefers the deepest toc path when multiple nested entries share the same spine item", () => {
    expect(
      findTocPathBySpineItemId(
        [
          {
            children: [
              {
                children: [
                  {
                    id: "genesis-10-heading",
                    label: "Nations Descended from Noah",
                    target: "genesis.xhtml#heading",
                  },
                ],
                id: "genesis-10",
                label: "Chapter 10",
                target: "genesis.xhtml#chapter-10",
              },
            ],
            id: "genesis",
            label: "GENESIS",
            target: "genesis.xhtml#book",
          },
        ],
        "genesis.xhtml",
      ).map((item) => item.label),
    ).toEqual(["GENESIS", "Chapter 10", "Nations Descended from Noah"]);
  });
});
