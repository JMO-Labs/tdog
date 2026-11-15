import { expect, test } from "vitest";
import { leaves } from "../layout/tree";
import { runToTree } from "./layout";

const run = (layout?: unknown) => ({
  scene: "sc-1",
  name: "dev",
  existing: false,
  panes: [
    { pane: "a", session: "s-a" },
    { pane: "b", session: "s-b" },
  ],
  layout,
});

test("maps layout slots to fresh pane ids bound to their sessions", () => {
  const { tree, sessions } = runToTree(
    run({
      type: "split",
      dir: "col",
      ratio: 0.3,
      a: { type: "pane", pane: "b" },
      b: { type: "pane", pane: "a" },
    }) as never,
  );
  const ids = leaves(tree);
  expect(ids).toHaveLength(2);
  expect(sessions[ids[0]]).toBe("s-b");
  expect(sessions[ids[1]]).toBe("s-a");
  expect(tree).toMatchObject({ t: "split", dir: "col", ratio: 0.3 });
});

test("no layout: panes sit side by side", () => {
  const { tree, sessions } = runToTree(run() as never);
  expect(leaves(tree).map((i) => sessions[i])).toEqual(["s-a", "s-b"]);
});
