import { beforeEach, expect, test } from "vitest";
import type { Node } from "../layout/tree";
import {
  applySaved,
  getSave,
  isDirty,
  putSave,
  snapshot,
  validName,
} from "./sceneSave";

const tree: Node = {
  t: "split",
  id: "s1",
  dir: "row",
  ratio: 0.3,
  a: { t: "leaf", id: "p1", title: "api" },
  b: { t: "leaf", id: "p2" },
};
const info = (id: string) =>
  id === "p1"
    ? { preset: "app", cwd: "/srv/api", theme: "ack-ack", title: "api" }
    : { cwd: "/tmp" };

beforeEach(() => localStorage.clear());

test("snapshot keeps shape, ratios and per-pane data", () => {
  const s = snapshot(tree, info);
  expect(s).toEqual({
    t: "split",
    dir: "row",
    ratio: 0.3,
    a: {
      t: "leaf",
      preset: "app",
      cwd: "/srv/api",
      theme: "ack-ack",
      title: "api",
    },
    b: { t: "leaf", cwd: "/tmp" },
  });
});

test("saves persist across reloads", () => {
  putSave("dev", snapshot(tree, info));
  expect(getSave("dev")).toEqual(snapshot(tree, info));
  expect(getSave("nope")).toBeUndefined();
});

test("a matching scene is clean even with new ids", () => {
  const saved = snapshot(tree, info);
  const other: Node = {
    ...(tree as Extract<Node, { t: "split" }>),
    a: { t: "leaf", id: "x1", title: "api" },
    b: { t: "leaf", id: "x2" },
  };
  const same = (id: string) => info(id === "x1" ? "p1" : "p2");
  expect(isDirty(saved, other, same)).toBe(false);
});

test("ratio, cwd, title and theme changes make it dirty", () => {
  const saved = snapshot(tree, info);
  const t2 = { ...(tree as Extract<Node, { t: "split" }>), ratio: 0.5 };
  expect(isDirty(saved, t2, info)).toBe(true);
  expect(isDirty(saved, tree, (id) => ({ ...info(id), cwd: "/x" }))).toBe(true);
  expect(isDirty(saved, tree, (id) => ({ ...info(id), theme: "y" }))).toBe(
    true,
  );
  const t3 = {
    ...(tree as Extract<Node, { t: "split" }>),
    a: { t: "leaf" as const, id: "p1", title: "other" },
  };
  expect(isDirty(saved, t3, info)).toBe(true);
});

test("a split replaced by a leaf is dirty; unknown live cwd is not", () => {
  const saved = snapshot(tree, info);
  expect(isDirty(saved, { t: "leaf", id: "p1" }, info)).toBe(true);
  expect(isDirty(saved, tree, (id) => ({ ...info(id), cwd: undefined }))).toBe(
    false,
  );
});

test("applySaved restores titles and themes by leaf order", () => {
  const fresh: Node = {
    t: "split",
    id: "s1",
    dir: "row",
    ratio: 0.3,
    a: { t: "leaf", id: "n1" },
    b: { t: "leaf", id: "n2" },
  };
  const { tree: out, themes } = applySaved(snapshot(tree, info), fresh);
  expect(out).toMatchObject({ a: { id: "n1", title: "api" } });
  expect(themes).toEqual({ n1: "ack-ack" });
});

test("validName follows the server slug rule", () => {
  expect(validName("my-scene_1")).toBe(true);
  expect(validName("My Scene")).toBe(false);
  expect(validName("-x")).toBe(false);
});
