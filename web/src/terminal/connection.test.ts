import { describe, expect, test } from "vitest";
import { INITIAL, step, type ConnState } from "./connection";

const closed = { t: "status", status: "closed" } as const;
const open = { t: "status", status: "open" } as const;
const connecting = { t: "status", status: "connecting" } as const;

function run(...evs: Parameters<typeof step>[1][]): ConnState {
  return evs.reduce(step, INITIAL);
}

describe("connection phases", () => {
  test("starts live and stays live on first connect", () => {
    expect(run(connecting, open).phase).toBe("live");
  });

  test("a drop shows tracking, also while retrying", () => {
    expect(run(open, closed).phase).toBe("tracking");
    expect(run(open, closed, connecting).phase).toBe("tracking");
  });

  test("reconnect goes static, then rewinding, then live", () => {
    let s = run(open, closed, connecting, open);
    expect(s.phase).toBe("static");
    s = step(s, { t: "staticDone" });
    expect(s.phase).toBe("rewinding");
    s = step(s, { t: "replayDone" });
    expect(s).toEqual({ phase: "live", dropped: false });
  });

  test("a clean shell exit is not a drop", () => {
    expect(
      run(open, { t: "status", status: "closed", exited: true }).phase,
    ).toBe("live");
  });

  test("a second drop mid-rewind goes back to tracking", () => {
    const s = run(open, closed, open, { t: "staticDone" }, closed);
    expect(s.phase).toBe("tracking");
  });

  test("stray timer events are ignored outside their phase", () => {
    expect(step(INITIAL, { t: "staticDone" })).toBe(INITIAL);
    expect(step(INITIAL, { t: "replayDone" })).toBe(INITIAL);
  });
});
