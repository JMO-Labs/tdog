import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Boot } from "./Boot";
import { BOOT_MS } from "./boot";

afterEach(() => vi.useRealTimers());

test.each([
  "tracker",
  "rain",
  "post",
  "dialup",
  "rewind",
  "cartridge",
  "wipe",
] as const)("%s renders and finishes by itself within the limit", (v) => {
  vi.useFakeTimers();
  const done = vi.fn();
  const { container } = render(<Boot variant={v} onDone={done} />);
  expect(container.querySelector(`[data-boot="${v}"]`)).toBeTruthy();
  act(() => void vi.advanceTimersByTime(BOOT_MS));
  expect(done).toHaveBeenCalledTimes(1);
});

test("any key or pointer skips", () => {
  const done = vi.fn();
  render(<Boot variant="post" onDone={done} />);
  fireEvent.keyDown(window, { key: "x" });
  expect(done).toHaveBeenCalledTimes(1);
  fireEvent.pointerDown(window);
  expect(done).toHaveBeenCalledTimes(1);
});
