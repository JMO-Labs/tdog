import { beforeEach, expect, test } from "vitest";
import { dropZone, movePane, neighbour, swapPanes } from "./dnd";
import { loadLayout, saveLayout } from "./store";
import { moveToScene, onLayoutChange } from "./transfer";
import { leaves, splitLeaf, type Node } from "./tree";

const R = { left: 0, top: 0, width: 100, height: 100 };
const one: Node = { t: "leaf", id: "a" };
const two = splitLeaf(one, "a", "row", "b", "s1");
const three = splitLeaf(two, "b", "col", "c", "s2");

test("dropZone: centre swaps, edges resolve to nearest side", () => {
  expect(dropZone(50, 50, R)).toBe("swap");
  expect(dropZone(5, 50, R)).toBe("left");
  expect(dropZone(95, 50, R)).toBe("right");
  expect(dropZone(50, 5, R)).toBe("top");
  expect(dropZone(50, 95, R)).toBe("bottom");
  expect(dropZone(10, 20, R)).toBe("left");
  expect(dropZone(90, 80, R)).toBe("right");
});

test("dropZone honours the rect offset and a zero-size rect", () => {
  const r = { left: 200, top: 100, width: 100, height: 100 };
  expect(dropZone(205, 150, r)).toBe("left");
  expect(dropZone(250, 150, r)).toBe("swap");
  expect(dropZone(1, 1, { left: 0, top: 0, width: 0, height: 0 })).toBe("swap");
});

test("swapPanes exchanges two leaves, keeping the shape", () => {
  const t = swapPanes(three, "a", "c");
  expect(leaves(t)).toEqual(["c", "b", "a"]);
  expect(swapPanes(three, "a", "zzz")).toBe(three);
});

test("movePane left/right/top/bottom re-docks next to the target", () => {
  const l = movePane(three, "c", "a", "left");
  expect(leaves(l)).toEqual(["c", "a", "b"]);
  const r = movePane(three, "c", "a", "right");
  expect(leaves(r)).toEqual(["a", "c", "b"]);
  const t = movePane(two, "b", "a", "top");
  expect(t).toMatchObject({ t: "split", dir: "col" });
  expect(leaves(t)).toEqual(["b", "a"]);
  const b = movePane(two, "b", "a", "bottom");
  expect(b).toMatchObject({ t: "split", dir: "col" });
  expect(leaves(b)).toEqual(["a", "b"]);
});

test("movePane swap, self-drop and unknown ids", () => {
  expect(leaves(movePane(two, "a", "b", "swap"))).toEqual(["b", "a"]);
  expect(movePane(two, "a", "a", "left")).toBe(two);
  expect(movePane(two, "x", "a", "left")).toBe(two);
  expect(movePane(two, "a", "x", "left")).toBe(two);
});

test("neighbour wraps through leaf order", () => {
  expect(neighbour(three, "a", 1)).toBe("b");
  expect(neighbour(three, "a", -1)).toBe("c");
  expect(neighbour(three, "c", 1)).toBe("a");
  expect(neighbour(one, "a", 1)).toBeUndefined();
  expect(neighbour(three, "nope", 1)).toBeUndefined();
});

beforeEach(() => localStorage.clear());

test("moveToScene detaches from source, appends to destination, notifies", () => {
  saveLayout("s1", two);
  saveLayout("s2", { t: "leaf", id: "z" });
  const seen: string[] = [];
  const off1 = onLayoutChange("s1", () => seen.push("s1"));
  const off2 = onLayoutChange("s2", () => seen.push("s2"));
  expect(moveToScene("b", "s1", "s2")).toBe(true);
  expect(leaves(loadLayout("s1") as Node)).toEqual(["a"]);
  expect(leaves(loadLayout("s2") as Node)).toEqual(["z", "b"]);
  expect(seen.sort()).toEqual(["s1", "s2"]);
  off1();
  off2();
});

test("moveToScene handles emptied source and empty destination", () => {
  saveLayout("s1", one);
  saveLayout("s2", null);
  expect(moveToScene("a", "s1", "s2")).toBe(true);
  expect(loadLayout("s1")).toBeNull();
  expect(loadLayout("s2")).toEqual({ t: "leaf", id: "a" });
});

test("moveToScene rejects same scene, missing pane, missing source", () => {
  saveLayout("s1", two);
  expect(moveToScene("a", "s1", "s1")).toBe(false);
  expect(moveToScene("nope", "s1", "s2")).toBe(false);
  expect(moveToScene("a", "ghost", "s2")).toBe(false);
  expect(leaves(loadLayout("s1") as Node)).toEqual(["a", "b"]);
});
