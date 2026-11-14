import { MIN_PASSWORD } from "./constants";

const FULL = 16;

/** Cassette-tape strength meter: fill percentage and its copy. */
export function tape(n: number): { pct: number; label: string } {
  const pct = Math.min(100, (n / FULL) * 100);
  const left = MIN_PASSWORD - n;
  const label =
    n === 0
      ? `Tape empty. ${MIN_PASSWORD} characters minimum.`
      : left > 0
        ? `${left} more character${left === 1 ? "" : "s"} to go.`
        : n < FULL
          ? "Good enough to record."
          : "Full tape. Totally tubular.";
  return { pct, label };
}
