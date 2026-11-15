import { beforeEach, expect, it } from "vitest";
import { themeStore } from "./store";
import { findTheme } from "./registry";
import { sceneArt, setSceneArt } from "../presets/panes";
import { setPref } from "../settings/prefs";

beforeEach(() => {
  localStorage.clear();
  themeStore.reset();
  document.documentElement.removeAttribute("data-theme");
});

const plain = () => themeStore.terminal("plain");

it("bundles a valid Plain theme with no pattern, effects or motif", () => {
  const t = findTheme("plain")!;
  expect(t.chrome.pattern).toBe("none");
  expect(t.chrome.shape.shadow).toBe("none");
  expect(t.terminal.effects).toEqual([]);
  expect(t.light).toBeTruthy();
});

it("serious forces Plain on chrome and every terminal, then restores", () => {
  themeStore.select("black-box");
  const before = themeStore.terminal("night-market");
  const root = document.documentElement;
  const bg = root.style.getPropertyValue("--term-bg");
  expect(themeStore.effects("black-box").length).toBeGreaterThan(0);

  setPref("serious", true);
  expect(themeStore.get().id).toBe("plain");
  expect(themeStore.terminal("night-market")).toEqual(plain());
  expect(themeStore.terminal(null)).toEqual(plain());
  expect(themeStore.effects("black-box")).toEqual([]);
  expect(themeStore.terminalMotif("black-box")).toBeNull();
  expect(themeStore.scope("vt323-theme-less").font).toBe("jetbrains-mono");
  expect(root.style.getPropertyValue("--term-bg")).not.toBe(bg);
  expect(root.style.getPropertyValue("--pattern")).toBe("none");
  expect(root.dataset.serious).toBe("1");

  setPref("serious", false);
  expect(themeStore.get().id).toBe("black-box");
  expect(themeStore.terminal("night-market")).toEqual(before);
  expect(root.style.getPropertyValue("--term-bg")).toBe(bg);
  expect(root.dataset.serious).toBeUndefined();
  expect(localStorage.getItem("tdog.theme.id")).toBe("black-box");
});

it("ignores select and preview while on, and the scheme still flips light/dark", () => {
  setPref("serious", true);
  themeStore.select("memphis-pop");
  themeStore.preview("black-box");
  expect(themeStore.get().id).toBe("plain");
  const root = document.documentElement;
  themeStore.setScheme("light");
  const light = root.style.getPropertyValue("--term-bg");
  expect(root.dataset.theme).toBe("light");
  themeStore.setScheme("dark");
  expect(root.style.getPropertyValue("--term-bg")).not.toBe(light);
  expect(root.dataset.theme).toBe("dark");
  setPref("serious", false);
  expect(localStorage.getItem("tdog.theme.id")).toBe("memphis-pop");
});

it("starts serious when the pref is already stored", () => {
  localStorage.setItem("tdog.serious", "1");
  themeStore.reset();
  expect(themeStore.get().id).toBe("plain");
});

it("serious mode shows no motif or effects even in an opted-in scene", () => {
  setSceneArt("s1", true);
  expect(sceneArt("s1")).toBe(true);
  expect(themeStore.effects("black-box").length).toBeGreaterThan(0);
  setPref("serious", true);
  expect(themeStore.effects("black-box")).toEqual([]);
  expect(themeStore.terminalMotif("black-box")).toBeNull();
});
