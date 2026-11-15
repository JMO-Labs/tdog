import { describe, expect, it } from "vitest";
import {
  fromSceneLayout,
  toSceneLayout,
  type SceneLayout,
} from "./sceneLayout";
import type { Node } from "./tree";

const tree: Node = {
  t: "split",
  id: "s1",
  dir: "row",
  ratio: 0.4,
  a: { t: "leaf", id: "ed" },
  b: {
    t: "split",
    id: "s2",
    dir: "col",
    ratio: 0.7,
    a: { t: "leaf", id: "sh" },
    b: { t: "leaf", id: "logs" },
  },
};

const layout: SceneLayout = {
  type: "split",
  dir: "row",
  ratio: 0.4,
  a: { type: "pane", pane: "ed" },
  b: {
    type: "split",
    dir: "col",
    ratio: 0.7,
    a: { type: "pane", pane: "sh" },
    b: { type: "pane", pane: "logs" },
  },
};

describe("scene layout converter", () => {
  it("stores no renderer ids or titles", () => {
    expect(toSceneLayout(tree)).toEqual(layout);
    const titled: Node = { t: "leaf", id: "x", title: "Hi" };
    expect(toSceneLayout(titled)).toEqual({ type: "pane", pane: "x" });
  });

  it("round-trips web tree -> layout -> web tree", () => {
    expect(fromSceneLayout(toSceneLayout(tree))).toEqual(tree);
  });

  it("round-trips layout -> web tree -> layout", () => {
    expect(toSceneLayout(fromSceneLayout(layout))).toEqual(layout);
  });

  it("generates unique split ids", () => {
    const ids = new Set<string>();
    const walk = (n: Node) => {
      if (n.t === "split") {
        ids.add(n.id);
        walk(n.a);
        walk(n.b);
      }
    };
    walk(fromSceneLayout(layout));
    expect(ids.size).toBe(2);
  });
});
