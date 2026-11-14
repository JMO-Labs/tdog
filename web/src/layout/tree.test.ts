import { expect, test } from "vitest";
import { closeLeaf, leaves, setRatio, splitLeaf, type Node } from "./tree";

const leaf = (id: string): Node => ({ t: "leaf", id });

test("split right wraps the leaf in a row split with the new pane second", () => {
  const t = splitLeaf(leaf("a"), "a", "row", "b", "s1");
  expect(t).toEqual({
    t: "split",
    id: "s1",
    dir: "row",
    ratio: 0.5,
    a: leaf("a"),
    b: leaf("b"),
  });
});

test("split down nests inside an existing split", () => {
  const t1 = splitLeaf(leaf("a"), "a", "row", "b", "s1");
  const t2 = splitLeaf(t1, "b", "col", "c", "s2");
  expect(leaves(t2)).toEqual(["a", "b", "c"]);
  expect(t2.t === "split" && t2.b.t === "split" && t2.b.dir).toBe("col");
});

test("close promotes the sibling; last close yields null", () => {
  const t = splitLeaf(leaf("a"), "a", "row", "b", "s1");
  expect(closeLeaf(t, "a")).toEqual(leaf("b"));
  expect(closeLeaf(leaf("b"), "b")).toBeNull();
  expect(closeLeaf(t, "zzz")).toEqual(t);
});

test("setRatio clamps and targets one split", () => {
  const t = splitLeaf(leaf("a"), "a", "row", "b", "s1");
  expect(setRatio(t, "s1", 0.3)).toMatchObject({ ratio: 0.3 });
  expect(setRatio(t, "s1", 0.01)).toMatchObject({ ratio: 0.1 });
  expect(setRatio(t, "s1", 2)).toMatchObject({ ratio: 0.9 });
});
