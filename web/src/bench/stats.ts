/** Bench statistics. MB = 1e6 bytes; times in ms. */
export interface FrameStats {
  count: number;
  avg: number;
  p95: number;
  max: number;
}

export function throughputMBps(bytes: number, ms: number): number {
  return ms > 0 ? bytes / 1e6 / (ms / 1000) : 0;
}

/** Nearest-rank percentile; 0 for an empty sample. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[Math.min(rank, s.length) - 1];
}

export function frameStats(deltas: readonly number[]): FrameStats {
  if (deltas.length === 0) return { count: 0, avg: 0, p95: 0, max: 0 };
  const sum = deltas.reduce((a, b) => a + b, 0);
  return {
    count: deltas.length,
    avg: sum / deltas.length,
    p95: percentile(deltas, 95),
    max: Math.max(...deltas),
  };
}

export function fpsFromFrames(deltas: readonly number[]): number {
  const { avg } = frameStats(deltas);
  return avg > 0 ? 1000 / avg : 0;
}
