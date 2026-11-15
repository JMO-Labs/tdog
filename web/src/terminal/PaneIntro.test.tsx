import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setPref } from "../settings/prefs";
import { PANE_INTRO_MS, PaneIntro } from "./PaneIntro";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const intro = (c: HTMLElement) => c.querySelector("[data-testid=pane-intro]");

test("plays on first mount and is gone after the timeout", () => {
  const { container } = render(<PaneIntro theme="black-box" />);
  expect(intro(container)?.getAttribute("data-boot")).toBe("post");
  act(() => void vi.advanceTimersByTime(PANE_INTRO_MS));
  expect(intro(container)).toBeNull();
});

test("does not capture keystrokes", () => {
  const { container } = render(<PaneIntro theme="black-box" />);
  expect(intro(container)?.className).toContain("pane-intro");
  expect(fireEvent.keyDown(window, { key: "x" })).toBe(true);
  expect(intro(container)).not.toBeNull();
});

test("does not replay on theme change", () => {
  const { container, rerender } = render(<PaneIntro theme="black-box" />);
  act(() => void vi.advanceTimersByTime(PANE_INTRO_MS));
  rerender(<PaneIntro theme="bayside" />);
  expect(intro(container)).toBeNull();
});

test("drop variant has no pane scene", () => {
  const { container } = render(<PaneIntro theme="ack-ack" />);
  expect(intro(container)).toBeNull();
});

test.each([
  ["serious", () => setPref("serious", true)],
  ["perf", () => setPref("perf", true)],
  ["boot pref off", () => setPref("boot", false)],
  [
    "reduced motion",
    () =>
      vi.stubGlobal("matchMedia", () => ({ matches: true }) as MediaQueryList),
  ],
])("off when %s", (_n, off) => {
  off();
  const { container } = render(<PaneIntro theme="black-box" />);
  expect(intro(container)).toBeNull();
});
