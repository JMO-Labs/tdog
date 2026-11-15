import { beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({ startScene: vi.fn() }));
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  startScene: m.startScene,
}));

import { openScenePreset } from "./openScene";

beforeEach(() => {
  localStorage.clear();
  m.startScene.mockReset();
});

test("uses the built-in copy when no translator is passed", async () => {
  m.startScene.mockResolvedValue({
    scene: "dev",
    name: "dev",
    existing: false,
    panes: [{ pane: "s1", session: "sess-1" }],
  });
  const openTab = vi.fn();
  const toast = vi.fn();
  await openScenePreset("dev", openTab, toast);
  expect(openTab).toHaveBeenCalledWith(expect.any(String), "dev");
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast.mock.calls[0][0]).toBe("success");
  expect(toast.mock.calls[0][1]).toContain("dev");
});

test("a failed start toasts the error and opens nothing", async () => {
  m.startScene.mockRejectedValue(new Error("nope"));
  const openTab = vi.fn();
  const toast = vi.fn();
  await openScenePreset("dev", openTab, toast);
  expect(openTab).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith("fail", expect.stringContaining("nope"));
});
