import { beforeEach, expect, test } from "vitest";
import {
  panePreset,
  sceneArt,
  setSceneArt,
  paneZoom,
  setPaneZoom,
  panePresets,
  scenePreset,
  setPanePreset,
  setScenePreset,
  paneRecording,
  setPaneRecording,
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

test("paneTheme round-trips", async () => {
  const { paneTheme, setPaneTheme } = await import("./panes");
  setPaneTheme("p1", "ack-ack");
  expect(paneTheme("p1")).toBe("ack-ack");
  expect(paneTheme("p2")).toBeUndefined();
});

test("paneTheme is undefined for corrupt or non-object storage", async () => {
  const { paneTheme } = await import("./panes");
  localStorage.setItem("tdog.paneThemes", "{not json");
  expect(paneTheme("p1")).toBeUndefined();
  localStorage.setItem("tdog.paneThemes", "[1]");
  expect(paneTheme("p1")).toBeUndefined();
});

test("pane zoom persists per pane and 0 clears it", () => {
  expect(paneZoom("p1")).toBe(0);
  setPaneZoom("p1", 3);
  setPaneZoom("p2", -1);
  expect([paneZoom("p1"), paneZoom("p2")]).toEqual([3, -1]);
  setPaneZoom("p1", 0);
  expect(paneZoom("p1")).toBe(0);
  expect(localStorage.getItem("tdog.paneZoom")).toBe('{"p2":-1}');
});

test("sceneArt persists", () => {
  expect(sceneArt("s1")).toBe(false);
  setSceneArt("s1", true);
  expect(sceneArt("s1")).toBe(true);
  expect(localStorage.getItem("tdog.sceneArt")).toBe('{"s1":true}');
  setSceneArt("s1", false);
  expect(sceneArt("s1")).toBe(false);
  expect(localStorage.getItem("tdog.sceneArt")).toBeNull();
});

test("sceneArt treats malformed JSON as all off", () => {
  localStorage.setItem("tdog.sceneArt", "{nope");
  expect(sceneArt("s1")).toBe(false);
  setSceneArt("s1", true);
  expect(sceneArt("s1")).toBe(true);
});

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
