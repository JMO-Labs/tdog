import { Orientation, type SplitviewApi } from "dockview-react";
import { expect, test, vi } from "vitest";
import { MIN_PANE, mountSplit, orientation } from "./dock";

function fakeApi(width: number, height: number) {
  const panels: { api: { width: number; height: number } }[] = [];
  let listener = () => {};
  const api = {
    width,
    height,
    panels,
    addPanel: vi.fn<(o: object) => void>(() => {
      panels.push({ api: { width: 0, height: 0 } });
    }),
    onDidLayoutChange: (l: () => void) => {
      listener = l;
      return { dispose() {} };
    },
  };
  return { api, panels, fire: () => listener() };
}

test("maps split direction to dockview orientation", () => {
  expect(orientation("row")).toBe(Orientation.HORIZONTAL);
  expect(orientation("col")).toBe(Orientation.VERTICAL);
});

test("adds panels a and b sized by the saved ratio", () => {
  const f = fakeApi(400, 1000);
  mountSplit(f.api as unknown as SplitviewApi, "row", 0.25, vi.fn());
  expect(f.api.addPanel.mock.calls).toEqual([
    [{ id: "a", component: "child", minimumSize: MIN_PANE, size: 100 }],
    [{ id: "b", component: "child", minimumSize: MIN_PANE, size: 300 }],
  ]);
});

test("unsized container lets dockview distribute", () => {
  const f = fakeApi(0, 0);
  mountSplit(f.api as unknown as SplitviewApi, "col", 0.3, vi.fn());
  expect(f.api.addPanel.mock.calls[0][0]).toMatchObject({ size: undefined });
});

test("relayout reports the first panel's share on the split axis", () => {
  const f = fakeApi(1000, 400);
  const cb = vi.fn();
  mountSplit(f.api as unknown as SplitviewApi, "col", 0.5, cb);
  f.panels[0].api.height = 100;
  f.fire();
  expect(cb).toHaveBeenCalledWith(0.25);
  f.api.height = 0;
  f.fire();
  expect(cb).toHaveBeenCalledTimes(1);
});
