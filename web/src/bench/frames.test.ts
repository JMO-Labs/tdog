import { expect, it } from "vitest";
import { startFrameSampler } from "./frames";

it("records deltas between animation frames until stopped", () => {
  const cbs: ((t: number) => void)[] = [];
  const raf = (cb: (t: number) => void) => cbs.push(cb);
  const cancelled: number[] = [];
  const s = startFrameSampler(raf, (id) => cancelled.push(id));
  for (const t of [0, 16, 33, 50]) cbs[cbs.length - 1](t);
  expect(s.deltas()).toEqual([16, 17, 17]);
  s.stop();
  expect(cancelled).toEqual([5]);
});
