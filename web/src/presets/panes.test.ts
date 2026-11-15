import { beforeEach, expect, test } from "vitest";
import { panePreset, panePresets, setPanePreset } from "./panes";

beforeEach(() => localStorage.clear());

test("panePresets is empty for corrupt JSON", () => {
  localStorage.setItem("tdog.panePresets", "{not json");
  expect(panePresets()).toEqual({});
});

test("panePresets ignores non-object values", () => {
  localStorage.setItem("tdog.panePresets", "[1]");
  expect(panePresets()).toEqual({});
  localStorage.setItem("tdog.panePresets", "null");
  expect(panePresets()).toEqual({});
});

test("setPanePreset stores per pane", () => {
  setPanePreset("p1", "a");
  setPanePreset("p2", "b");
  expect(panePreset("p1")).toBe("a");
  expect(panePresets()).toEqual({ p1: "a", p2: "b" });
});
