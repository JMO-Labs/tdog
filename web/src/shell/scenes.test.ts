import { beforeEach, expect, test } from "vitest";
import {
  addScene,
  closeScene,
  loadScenes,
  renameScene,
  reorderScene,
  saveScenes,
  type SceneState,
} from "./scenes";

const base: SceneState = {
  scenes: [
    { id: "a", name: "one" },
    { id: "b", name: "two" },
    { id: "c", name: "three" },
  ],
  active: "a",
};

beforeEach(() => localStorage.clear());

test("default is a single 'scene 1' keeping the legacy layout key", () => {
  const s = loadScenes();
  expect(s.scenes).toEqual([{ id: "scene 1", name: "scene 1" }]);
  expect(s.active).toBe("scene 1");
});

test("addScene appends, names it and activates it", () => {
  const s = addScene(base, "n1");
  expect(s.scenes.map((x) => x.id)).toEqual(["a", "b", "c", "n1"]);
  expect(s.scenes[3].name).toBe("scene 4");
  expect(s.active).toBe("n1");
});

test("renameScene trims; blank keeps the old name", () => {
  expect(renameScene(base, "b", "  logs ").scenes[1].name).toBe("logs");
  expect(renameScene(base, "b", "   ").scenes[1].name).toBe("two");
});

test("closeScene activates a neighbour; closing the last leaves a fresh one", () => {
  const s = closeScene({ ...base, active: "b" }, "b");
  expect(s.scenes.map((x) => x.id)).toEqual(["a", "c"]);
  expect(s.active).toBe("c");
  const last = closeScene({ scenes: [base.scenes[0]], active: "a" }, "a", "z");
  expect(last).toEqual({ scenes: [{ id: "z", name: "scene 1" }], active: "z" });
  expect(closeScene(base, "c").active).toBe("a");
});

test("reorderScene moves a tab to a target index", () => {
  expect(reorderScene(base, "a", 2).scenes.map((x) => x.id)).toEqual([
    "b",
    "c",
    "a",
  ]);
  expect(reorderScene(base, "c", 0).scenes.map((x) => x.id)).toEqual([
    "c",
    "a",
    "b",
  ]);
  expect(reorderScene(base, "zz", 0)).toBe(base);
});

test("persists and restores; garbage falls back to default", () => {
  saveScenes(base);
  expect(loadScenes()).toEqual(base);
  localStorage.setItem("tdog.scenes", "{nope");
  expect(loadScenes().scenes).toHaveLength(1);
  localStorage.setItem(
    "tdog.scenes",
    JSON.stringify({ scenes: [], active: "x" }),
  );
  expect(loadScenes().scenes).toHaveLength(1);
});

test("stale active id falls back to the first scene", () => {
  saveScenes({ ...base, active: "gone" });
  expect(loadScenes().active).toBe("a");
});
