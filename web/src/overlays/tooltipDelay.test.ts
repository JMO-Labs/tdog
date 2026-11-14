import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTooltipController, OPEN_DELAY_MS } from "./tooltipDelay";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("tooltip delay", () => {
  it("opens after 400 ms", () => {
    const open = vi.fn();
    const c = createTooltipController();
    c.enter("a", open);
    vi.advanceTimersByTime(OPEN_DELAY_MS - 1);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledOnce();
  });
  it("cancels when leaving before the delay", () => {
    const open = vi.fn();
    const c = createTooltipController();
    c.enter("a", open);
    c.leave("a", vi.fn());
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
  });
  it("opens instantly when moving to a neighbour", () => {
    const c = createTooltipController();
    const closeA = vi.fn();
    c.enter("a", vi.fn());
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    c.leave("a", closeA);
    expect(closeA).toHaveBeenCalled();
    const openB = vi.fn();
    vi.advanceTimersByTime(100);
    c.enter("b", openB);
    expect(openB).toHaveBeenCalledOnce();
  });
  it("restores the delay after the skip window", () => {
    const c = createTooltipController();
    c.enter("a", vi.fn());
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    c.leave("a", vi.fn());
    vi.advanceTimersByTime(1000);
    const openB = vi.fn();
    c.enter("b", openB);
    expect(openB).not.toHaveBeenCalled();
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    expect(openB).toHaveBeenCalled();
  });
});
