import { describe, expect, it, vi } from "vitest";
import { chunk, replay } from "./replay";
import type { TerminalRenderer } from "../terminal/renderer";

function fakeRenderer(async = false) {
  const writes: Uint8Array[] = [];
  const r = {
    write: vi.fn((d: Uint8Array, cb?: () => void) => {
      writes.push(d);
      if (async) setTimeout(() => cb?.(), 0);
      else cb?.();
    }),
  } as unknown as TerminalRenderer;
  return { r, writes };
}

describe("chunk", () => {
  it("splits into fixed-size views covering all bytes", () => {
    const parts = chunk(new Uint8Array([1, 2, 3, 4, 5]), 2);
    expect(parts.map((p) => [...p])).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("rejects non-positive sizes", () => {
    expect(() => chunk(new Uint8Array(1), 0)).toThrow();
  });
});

describe("replay", () => {
  it("writes every chunk in order and reports bytes and elapsed time", async () => {
    const { r, writes } = fakeRenderer();
    const data = new Uint8Array(10).map((_, i) => i);
    let t = 100;
    const now = () => (t += 5);
    const res = await replay(r, data, { chunkSize: 4, now });
    expect(writes.map((w) => w.length)).toEqual([4, 4, 2]);
    expect(writes.flatMap((w) => [...w])).toEqual([...data]);
    expect(res).toEqual({ bytes: 10, chunks: 3, ms: 5 });
  });

  it("waits for each write callback before the next write (back-pressure)", async () => {
    const { r } = fakeRenderer(true);
    const res = await replay(r, new Uint8Array(6), { chunkSize: 2 });
    expect(r.write).toHaveBeenCalledTimes(3);
    expect(res.bytes).toBe(6);
  });

  it("repeats the fixture `loops` times", async () => {
    const { r } = fakeRenderer();
    const res = await replay(r, new Uint8Array(4), { chunkSize: 4, loops: 3 });
    expect(r.write).toHaveBeenCalledTimes(3);
    expect(res.bytes).toBe(12);
  });

  it("stops early when aborted", async () => {
    const { r } = fakeRenderer();
    const ac = new AbortController();
    ac.abort();
    const res = await replay(r, new Uint8Array(8), {
      chunkSize: 2,
      signal: ac.signal,
    });
    expect(res.chunks).toBe(0);
  });
});
