import { beforeEach, expect, test, vi } from "vitest";
import { cwdFromOsc7, displayTitle, titleStore } from "./titles";

beforeEach(() => titleStore.clear());

test("cwdFromOsc7 decodes file URLs", () => {
  expect(cwdFromOsc7("file://host/home/me/my%20dir")).toBe("/home/me/my dir");
  expect(cwdFromOsc7("file:///tmp")).toBe("/tmp");
});

test("cwdFromOsc7 rejects other input", () => {
  expect(cwdFromOsc7("http://x/y")).toBeUndefined();
  expect(cwdFromOsc7("")).toBeUndefined();
  expect(cwdFromOsc7("file://host")).toBeUndefined();
  expect(cwdFromOsc7("file://host/%E0%A4%A")).toBeUndefined();
});

test("displayTitle prefers title, then cwd, then fallback", () => {
  expect(displayTitle({ title: "vim", cwd: "/a" }, "Container")).toBe("vim");
  expect(displayTitle({ cwd: "/a/b" }, "Container")).toBe("/a/b");
  expect(displayTitle({}, "Container")).toBe("Container");
  expect(displayTitle(undefined, "Container")).toBe("Container");
});

test("store updates merge and notify subscribers", () => {
  const cb = vi.fn();
  const off = titleStore.subscribe(cb);
  titleStore.set("p1", { title: "t" });
  titleStore.set("p1", { cwd: "/x" });
  expect(titleStore.get("p1")).toEqual({ title: "t", cwd: "/x" });
  expect(cb).toHaveBeenCalledTimes(2);
  off();
  titleStore.remove("p1");
  expect(cb).toHaveBeenCalledTimes(2);
  expect(titleStore.get("p1")).toBeUndefined();
});
