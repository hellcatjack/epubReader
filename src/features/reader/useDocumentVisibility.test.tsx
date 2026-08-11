import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useDocumentVisibility } from "./useDocumentVisibility";

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");

function setDocumentVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

afterEach(() => {
  if (originalVisibilityState) {
    Object.defineProperty(document, "visibilityState", originalVisibilityState);
    return;
  }

  Reflect.deleteProperty(document, "visibilityState");
});

it("tracks whether the document is visible", () => {
  setDocumentVisibility("visible");
  const { result } = renderHook(() => useDocumentVisibility());

  expect(result.current).toBe(true);

  act(() => {
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(result.current).toBe(false);

  act(() => {
    setDocumentVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(result.current).toBe(true);
});
