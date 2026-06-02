import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, expect } from "vitest";
import {
  buildSelectionTranslationBubbleStyle,
  SelectionTranslationBubble,
} from "./SelectionTranslationBubble";

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
    left: "16px",
    top: "216px",
  });
});

it("uses a 600px desktop width for placement and rendered sizing", () => {
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
        bottom: 424,
        height: 24,
        left: 500,
        right: 700,
        top: 400,
        width: 200,
      }}
      translation="中文翻译"
    />,
  );

  const bubble = screen.getByRole("status", { name: /selection translation/i });
  expect(bubble).toHaveStyle({
    left: "300px",
    width: "600px",
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
        left: 200,
        right: 600,
        top: 240,
        width: 400,
      }}
      translation="中文翻译"
    />,
  );

  expect(screen.getByRole("status", { name: /selection translation/i })).toHaveStyle({
    left: "612px",
    top: "240px",
  });
});

it("shrinks placement width to fit narrow viewports", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 420,
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
        left: 170,
        right: 270,
        top: 300,
        width: 100,
      }}
      translation="中文翻译"
    />,
  );

  expect(screen.getByRole("status", { name: /selection translation/i })).toHaveStyle({
    left: "16px",
    width: "388px",
  });
});

it("uses the measured bubble height when placing above a selection", () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 768,
  });

  const style = buildSelectionTranslationBubbleStyle(
    {
      bottom: 260,
      height: 24,
      left: 520,
      right: 680,
      top: 236,
      width: 160,
    },
    180,
  );

  expect(style).toEqual({
    left: 300,
    top: 44,
    width: 600,
  });
});
