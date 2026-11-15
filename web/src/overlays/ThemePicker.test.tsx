import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ThemePicker } from "./ThemePicker";
import { THEMES, findTheme } from "../theme/registry";
import { themeStore } from "../theme/store";

beforeEach(() => {
  vi.useFakeTimers();
  themeStore.reset();
});
afterEach(() => {
  vi.useRealTimers();
  themeStore.reset();
});

const open = () => render(<ThemePicker open onClose={() => {}} />);
const card = (id: string) => document.querySelector(`[data-theme-id="${id}"]`)!;

test("card colours come from theme data", () => {
  open();
  const t = findTheme("black-box")!;
  const c = card("black-box") as HTMLElement;
  expect(c.style.getPropertyValue("--c-bg")).toBe(t.terminal.palette.bg);
  expect(c.style.getPropertyValue("--c-fg")).toBe(t.terminal.palette.fg);
  expect(c.style.getPropertyValue("--c-cursor")).toBe(
    t.terminal.palette.cursor,
  );
  expect(c.style.getPropertyValue("--c-ansi-1")).toBe(
    t.terminal.palette.ansi[1],
  );
});

test("groups by appearance and filters by name", () => {
  open();
  expect(screen.getByRole("group", { name: "Dark" })).toBeTruthy();
  expect(document.querySelectorAll("[data-theme-id]").length).toBe(
    THEMES.length,
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "black b" },
  });
  expect(document.querySelectorAll("[data-theme-id]").length).toBe(1);
});

test("focus previews only after 150 ms; Esc reverts", () => {
  const onClose = vi.fn();
  render(<ThemePicker open onClose={onClose} />);
  const spy = vi.spyOn(themeStore, "preview");
  fireEvent.keyDown(screen.getByTestId("theme-grid"), { key: "ArrowRight" });
  expect(spy).not.toHaveBeenCalledWith(expect.stringMatching(/./));
  act(() => void vi.advanceTimersByTime(150));
  expect(spy).toHaveBeenCalledWith(expect.stringMatching(/./));
  fireEvent.keyDown(screen.getByTestId("theme-grid"), { key: "Escape" });
  expect(spy).toHaveBeenLastCalledWith(null);
  expect(onClose).toHaveBeenCalled();
});

test("wheel scroll neither moves selection nor previews hover", () => {
  open();
  const spy = vi.spyOn(themeStore, "preview");
  const list = screen.getByTestId("theme-grid");
  const before = document.querySelector('[aria-selected="true"]');
  fireEvent.pointerEnter(card("black-box"));
  fireEvent.wheel(list);
  act(() => void vi.advanceTimersByTime(100));
  fireEvent.scroll(list);
  act(() => void vi.advanceTimersByTime(100));
  expect(spy).not.toHaveBeenCalledWith("black-box");
  expect(document.querySelector('[aria-selected="true"]')).toBe(before);
  act(() => void vi.advanceTimersByTime(60));
  expect(spy).toHaveBeenCalledWith("black-box");
  expect(document.querySelector('[aria-selected="true"]')).toBe(before);
});

test("Enter applies the selected theme", () => {
  open();
  fireEvent.keyDown(screen.getByTestId("theme-grid"), { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByTestId("theme-grid"), { key: "Enter" });
  const id = themeStore.get().id;
  expect(localStorage.getItem("tdog.theme.id")).toBe(id);
});
