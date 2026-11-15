import { afterEach, expect, test, vi } from "vitest";
import { fetchShellName } from "./shellName";

afterEach(() => vi.unstubAllGlobals());

test("returns the shell basename from the API", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ shell: "bash" }), { status: 200 }),
      ),
  );
  expect(await fetchShellName()).toBe("bash");
});

test("falls back to 'shell' on failure or bad payload", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
  expect(await fetchShellName()).toBe("shell");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
  );
  expect(await fetchShellName()).toBe("shell");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("no", { status: 500 })),
  );
  expect(await fetchShellName()).toBe("shell");
});
