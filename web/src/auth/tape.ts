import type { CopyKey } from "../copy/copy";
import { MIN_PASSWORD } from "./constants";

const FULL = 16;

/** Cassette-tape strength meter: fill percentage and its copy key. */
export function tape(n: number): {
  pct: number;
  key: CopyKey;
  vars: Record<string, number>;
} {
  const pct = Math.min(100, (n / FULL) * 100);
  const left = MIN_PASSWORD - n;
  const vars = { min: MIN_PASSWORD, left };
  const key: CopyKey =
    n === 0
      ? "tape.empty"
      : left > 1
        ? "tape.more"
        : left === 1
          ? "tape.more1"
          : n < FULL
            ? "tape.ok"
            : "tape.full";
  return { pct, key, vars };
}
