import { beforeEach, expect, test, vi } from "vitest";
import { loadLayout, saveLayout } from "./store";
import { splitLeaf } from "./tree";

beforeEach(() => localStorage.clear());

test("save then load round-trips per scene", () => {
  const t = splitLeaf({ t: "leaf", id: "a" }, "a", "row", "b", "s1");
  saveLayout("one", t);
  expect(loadLayout("one")).toEqual(t);
  expect(loadLayout("two")).toBeUndefined();
});

test("null (all panes closed) round-trips as null", () => {
  saveLayout("one", null);
  expect(loadLayout("one")).toBeNull();
});

test("corrupt or malformed data loads as undefined", () => {
  localStorage.setItem("tdog.layout.one", "{nope");
  expect(loadLayout("one")).toBeUndefined();
  localStorage.setItem("tdog.layout.one", '{"t":"split","id":1}');
  expect(loadLayout("one")).toBeUndefined();
});

test("storage failures are swallowed", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() => saveLayout("one", null)).not.toThrow();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  expect(loadLayout("one")).toBeUndefined();
  vi.restoreAllMocks();
});

test("renamed titles round-trip; non-string titles are rejected", () => {
  const tree = { t: "leaf", id: "a", title: "logs" } as const;
  saveLayout("t", tree);
  expect(loadLayout("t")).toEqual(tree);
  localStorage.setItem(
    "tdog.layout.t",
    JSON.stringify({ t: "leaf", id: "a", title: 3 }),
  );
  expect(loadLayout("t")).toBeUndefined();
});
