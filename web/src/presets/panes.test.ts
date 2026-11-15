import { beforeEach, expect, test } from "vitest";
import {
  panePreset,
  panePresets,
  scenePreset,
  setPanePreset,
  setScenePreset,
} from "./panes";

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

test("scenePreset stores per scene tab and survives corrupt JSON", () => {
  expect(scenePreset("t1")).toBeUndefined();
  setScenePreset("t1", "dev");
  expect(scenePreset("t1")).toBe("dev");
  localStorage.setItem("tdog.scenePresets", "[1]");
  expect(scenePreset("t1")).toBeUndefined();
  localStorage.setItem("tdog.scenePresets", "{x");
  expect(scenePreset("t1")).toBeUndefined();
});
