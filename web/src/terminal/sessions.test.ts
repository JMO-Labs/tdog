import { afterEach, expect, test, vi } from "vitest";
import { findSessionId, killScene } from "./sessions";

afterEach(() => vi.unstubAllGlobals());

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

test("killScene POSTs the kill route for the matching session", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(ok(list))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", f);
  await killScene("pa");
  expect(f.mock.calls[1][0]).toBe("/api/sessions/x1/kill");
  expect(f.mock.calls[1][1].method).toBe("POST");
});

test("killScene does nothing when no session matches", async () => {
  const f = vi.fn().mockResolvedValue(ok(list));
  vi.stubGlobal("fetch", f);
  await killScene("none");
  expect(f).toHaveBeenCalledTimes(1);
});
