import { afterEach, expect, test, vi } from "vitest";
import { apiPut } from "./api";

afterEach(() => vi.unstubAllGlobals());

test("apiPut defaults to text/plain and accepts another type", async () => {
  const f = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", f);
  await apiPut("/x", "a");
  await apiPut("/x", "{}", "PUT", "application/json");
  const types = (f.mock.calls as unknown as [string, RequestInit][]).map(
    (c) => (c[1].headers as Record<string, string>)["Content-Type"],
  );
  expect(types).toEqual(["text/plain", "application/json"]);
});
