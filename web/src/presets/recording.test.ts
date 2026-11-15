import { afterEach, expect, test } from "vitest";
import { paneRecording, setPaneRecording } from "./recording";

afterEach(() => localStorage.clear());

test("paneRecording defaults on, stores only off panes, tolerates junk", () => {
  expect(paneRecording("a")).toBe(true);
  setPaneRecording("a", false);
  expect(localStorage.getItem("tdog.paneRecording")).toBe('{"a":false}');
  expect(paneRecording("a")).toBe(false);
  expect(paneRecording("b")).toBe(true);
  setPaneRecording("a", true);
  expect(localStorage.getItem("tdog.paneRecording")).toBeNull();
  localStorage.setItem("tdog.paneRecording", "{nope");
  expect(paneRecording("a")).toBe(true);
});
