import { afterEach, expect, test, vi } from "vitest";
import { isKilled } from "./killed";
import { findSessionId, killScene, sessionExists } from "./sessions";
import { paneRecording, setPaneRecording } from "../presets/recording";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const list = [
  { id: "x1", scene: "pa" },
  { id: "x2", scene: "pb" },
];
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

test("findSessionId matches by scene", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(list)));
  expect(await findSessionId("pb")).toBe("x2");
  expect(await findSessionId("none")).toBeUndefined();
});

test("findSessionId is undefined on network or http failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
  expect(await findSessionId("pa")).toBeUndefined();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("no", { status: 500 })),
  );
  expect(await findSessionId("pa")).toBeUndefined();
});

test("killScene POSTs the scene kill route and returns the server count", async () => {
  const f = vi.fn().mockResolvedValue(ok({ killed: 2 }));
  vi.stubGlobal("fetch", f);
  expect(await killScene("pa")).toBe(2);
  expect(f.mock.calls[0][0]).toBe("/api/scenes/pa/kill");
  expect(f.mock.calls[0][1].method).toBe("POST");
});

test("killScene marks the pane killed only when something died", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ killed: 0 })));
  expect(await killScene("pa")).toBe(0);
  expect(isKilled("pa")).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ killed: 1 })));
  await killScene("pa");
  expect(isKilled("pa")).toBe(true);
});

test("killScene is 0 when the kill request fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
  expect(await killScene("pa")).toBe(0);
});

test("sessionExists is true only when the server lists the id", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(list)));
  expect(await sessionExists("x2")).toBe(true);
  expect(await sessionExists("zz")).toBe(false);
});

test("sessionExists is false on http or network failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("no", { status: 500 })),
  );
  expect(await sessionExists("x1")).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
  expect(await sessionExists("x1")).toBe(false);
});

test("killScene forgets the pane's browser journal", async () => {
  const forget = vi.fn().mockResolvedValue(undefined);
  const db = await import("../journal/db");
  vi.spyOn(db, "journalDB").mockReturnValue({ forget } as never);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ killed: 0 })));
  await killScene("pa");
  expect(forget).toHaveBeenCalledWith("pa");
  vi.restoreAllMocks();
});

test("killScene works when no journal db exists", async () => {
  const db = await import("../journal/db");
  vi.spyOn(db, "journalDB").mockReturnValue(null);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ killed: 0 })));
  await expect(killScene("pa")).resolves.toBe(0);
  vi.restoreAllMocks();
});

test("killScene drops the pane's recording opt-out", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ killed: 0 })));
  setPaneRecording("pa", false);
  await killScene("pa");
  expect(paneRecording("pa")).toBe(true);
});
