import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_REWIND_MS,
  QUIET_MS,
  STATIC_MS,
  useConnectionPhase,
} from "./useConnectionPhase";
import type { SessionState } from "./session";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(initial: SessionState = { status: "connecting" }) {
  const onRewound = vi.fn();
  const hook = renderHook(({ s }) => useConnectionPhase(s, onRewound), {
    initialProps: { s: initial },
  });
  const set = (s: SessionState) => act(() => hook.rerender({ s }));
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  return { hook, onRewound, set, tick };
}

function reconnect(t: ReturnType<typeof setup>) {
  t.set({ status: "open" });
  t.set({ status: "closed" });
  t.set({ status: "connecting" });
  t.set({ status: "open" });
}

describe("useConnectionPhase timing", () => {
  test("reconnect: static, then rewinding, then live with one onRewound", () => {
    const t = setup();
    reconnect(t);
    expect(t.hook.result.current.phase).toBe("static");
    t.tick(STATIC_MS);
    expect(t.hook.result.current.phase).toBe("rewinding");
    expect(t.onRewound).not.toHaveBeenCalled();
    t.tick(QUIET_MS);
    expect(t.hook.result.current.phase).toBe("live");
    expect(t.onRewound).toHaveBeenCalledTimes(1);
    t.tick(MAX_REWIND_MS * 2);
    expect(t.onRewound).toHaveBeenCalledTimes(1);
  });

  test("noteOutput pushes live back to QUIET_MS after last output", () => {
    const t = setup();
    reconnect(t);
    t.tick(STATIC_MS);
    t.tick(QUIET_MS - 100);
    act(() => t.hook.result.current.noteOutput());
    t.tick(QUIET_MS - 1);
    expect(t.hook.result.current.phase).toBe("rewinding");
    t.tick(1);
    expect(t.hook.result.current.phase).toBe("live");
    expect(t.onRewound).toHaveBeenCalledTimes(1);
  });

  test("endless output is capped at MAX_REWIND_MS", () => {
    const t = setup();
    reconnect(t);
    t.tick(STATIC_MS);
    for (let i = 0; i < MAX_REWIND_MS / 100 - 1; i++) {
      t.tick(100);
      act(() => t.hook.result.current.noteOutput());
    }
    expect(t.hook.result.current.phase).toBe("rewinding");
    t.tick(100);
    expect(t.hook.result.current.phase).toBe("live");
    expect(t.onRewound).toHaveBeenCalledTimes(1);
  });

  test("exit stays live and never calls onRewound", () => {
    const t = setup();
    t.set({ status: "open" });
    t.set({ status: "closed", exitCode: 0 });
    t.tick(MAX_REWIND_MS * 2);
    expect(t.hook.result.current.phase).toBe("live");
    expect(t.onRewound).not.toHaveBeenCalled();
  });
});
