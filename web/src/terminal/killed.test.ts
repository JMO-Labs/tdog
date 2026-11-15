import { afterEach, expect, test, vi } from "vitest";
import { clearKilled, isKilled, markKilled, subscribeKilled } from "./killed";

afterEach(() => localStorage.clear());

test("killed marks persist in localStorage and clear", () => {
  expect(isKilled("p1")).toBe(false);
  markKilled("p1");
  expect(isKilled("p1")).toBe(true);
  expect(localStorage.getItem("tdog.killedPanes")).toContain("p1");
  clearKilled("p1");
  expect(isKilled("p1")).toBe(false);
});

test("subscribers are notified of changes", () => {
  const f = vi.fn();
  const off = subscribeKilled(f);
  markKilled("p2");
  clearKilled("p2");
  expect(f).toHaveBeenCalledTimes(2);
  off();
  markKilled("p2");
  expect(f).toHaveBeenCalledTimes(2);
});

test("corrupt storage reads as empty", () => {
  localStorage.setItem("tdog.killedPanes", "{oops");
  expect(isKilled("p1")).toBe(false);
});
