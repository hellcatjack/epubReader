import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { SelectionTranslationBubble } from "./SelectionTranslationBubble";

afterEach(() => {
  vi.restoreAllMocks();
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
    value: 1800,
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

it("uses the measured bubble height to place a tall translation above the selection without overlap", async () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 768,
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(
    this: HTMLElement,
  ) {
    if (this instanceof HTMLElement && this.classList.contains("reader-selection-translation-bubble")) {
      return {
        bottom: 188,
        height: 140,
        left: 0,
        right: 600,
        top: 48,
        width: 600,
        x: 0,
        y: 48,
        toJSON: () => ({}),
      };
    }

    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  });

  render(
    <SelectionTranslationBubble
      anchorRect={{
        bottom: 224,
        height: 24,
        left: 320,
        right: 520,
        top: 200,
        width: 200,
      }}
      translation="这是一段较长的中文翻译，用来触发更高的浮窗内容。"
    />,
  );

  await waitFor(() => {
    expect(screen.getByRole("status", { name: /selection translation/i })).toHaveStyle({
      top: "48px",
    });
  });
});

it("keeps the translation bubble within a narrow viewport", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 480,
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
        left: 180,
        right: 300,
        top: 300,
        width: 120,
      }}
      translation="中文翻译"
    />,
  );

  expect(screen.getByRole("status", { name: /selection translation/i })).toHaveStyle({
    left: "16px",
    width: "448px",
  });
});
