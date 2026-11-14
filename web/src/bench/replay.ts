import type { TerminalRenderer } from "../terminal/renderer";

export interface ReplayOptions {
  /** Bytes per write (like a WS frame). Default 16 KiB. */
  chunkSize?: number;
  /** Times the fixture is replayed. Default 1. */
  loops?: number;
  signal?: AbortSignal;
  now?: () => number;
}

export interface ReplayResult {
  bytes: number;
  chunks: number;
  ms: number;
}

export function chunk(data: Uint8Array, size: number): Uint8Array[] {
  if (size <= 0) throw new RangeError("chunk size must be > 0");
  const out: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size)
    out.push(data.subarray(i, i + size));
  return out;
}

/**
 * Feed `data` through the renderer, awaiting each write callback before the
 * next write (same back-pressure the live session applies), and time it.
 */
export async function replay(
  r: TerminalRenderer,
  data: Uint8Array,
  opts: ReplayOptions = {},
): Promise<ReplayResult> {
  const { chunkSize = 16 * 1024, loops = 1, signal } = opts;
  const now = opts.now ?? (() => performance.now());
  const parts = chunk(data, chunkSize);
  let bytes = 0;
  let chunks = 0;
  const t0 = now();
  outer: for (let l = 0; l < loops; l++) {
    for (const p of parts) {
      if (signal?.aborted) break outer;
      await new Promise<void>((res) => r.write(p, res));
      bytes += p.length;
      chunks++;
    }
  }
  return { bytes, chunks, ms: now() - t0 };
}
