import { describe, expect, it } from "vitest";
import { fpsFromFrames, frameStats, percentile, throughputMBps } from "./stats";

describe("stats", () => {
  it("throughput in MB/s (1 MB = 1e6 bytes)", () => {
    expect(throughputMBps(2_000_000, 1000)).toBe(2);
    expect(throughputMBps(500_000, 250)).toBe(2);
  });
  it("throughput is 0 for zero/negative time", () => {
    expect(throughputMBps(10, 0)).toBe(0);
    expect(throughputMBps(10, -1)).toBe(0);
  });
  it("nearest-rank percentile", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile(xs, 100)).toBe(100);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
  });
  it("frame stats: avg, p95, max, count", () => {
    const xs = [...Array(19).fill(10), 50];
    expect(frameStats(xs)).toEqual({ count: 20, avg: 12, p95: 10, max: 50 });
    expect(frameStats([...xs, 50])).toMatchObject({ p95: 50 });
  });
  it("frame stats of nothing are zeros", () => {
    expect(frameStats([])).toEqual({ count: 0, avg: 0, p95: 0, max: 0 });
  });
  it("fps from frame deltas", () => {
    expect(fpsFromFrames([16, 17, 17])).toBeCloseTo(1000 / (50 / 3));
    expect(fpsFromFrames([])).toBe(0);
  });
});
