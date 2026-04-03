import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { SelectionTranslationBubble } from "./SelectionTranslationBubble";

afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 768,
  });
});

it("prefers to place the translation bubble above the current selection when there is enough room", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 768,
  });

  render(
    <SelectionTranslationBubble
      anchorRect={{
        bottom: 324,
        height: 24,
        left: 200,
        right: 360,
        top: 300,
        width: 160,
      }}
      translation="中文翻译"
    />,
  );

  expect(screen.getByRole("status", { name: /selection translation/i })).toHaveStyle({
    top: "216px",
  });
});

it("moves the translation bubble beside a tall selection when neither above nor below can avoid overlap", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 768,
  });

  render(
    <SelectionTranslationBubble
      anchorRect={{
        bottom: 730,
        height: 690,
        left: 240,
        right: 560,
        top: 40,
        width: 320,
      }}
      translation="中文翻译"
    />,
  );

  expect(screen.getByRole("status", { name: /selection translation/i })).toHaveStyle({
    left: "572px",
    top: "40px",
  });
});

it("prefers a side placement for selections taller than several lines when side space is available", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1440,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 900,
  });

  render(
    <SelectionTranslationBubble
      anchorRect={{
        bottom: 372,
        height: 132,
        left: 420,
        right: 840,
        top: 240,
        width: 420,
      }}
      translation="中文翻译"
    />,
  );

  expect(screen.getByRole("status", { name: /selection translation/i })).toHaveStyle({
    left: "852px",
    top: "240px",
  });
});
