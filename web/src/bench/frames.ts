type Raf = (cb: (t: number) => void) => number;

/** Collect requestAnimationFrame deltas (ms) until stopped. */
export function startFrameSampler(
  raf: Raf = (cb) => requestAnimationFrame(cb),
  caf: (id: number) => void = (id) => cancelAnimationFrame(id),
) {
  const out: number[] = [];
  let last: number | null = null;
  let id = 0;
  const tick = (t: number) => {
    if (last !== null) out.push(t - last);
    last = t;
    id = raf(tick);
  };
  id = raf(tick);
  return {
    deltas: () => out,
    /** Keep only the last `n` deltas (rolling window). */
    trim(n: number) {
      if (out.length > n) out.splice(0, out.length - n);
    },
    stop: () => caf(id),
  };
}
