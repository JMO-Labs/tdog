import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HOLD_MS, KillDialog } from "./KillDialog";

const onConfirm = vi.fn();
const onClose = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  onConfirm.mockClear();
  onClose.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const show = (count = 3, scope = "all") =>
  render(
    <KillDialog
      open
      count={count}
      scope={scope}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );
const hold = () => screen.getByRole("button", { name: /hold to nuke/i });

test("shows how many shells will die", () => {
  show(3);
  expect(screen.getByText(/3 shells/)).toBeTruthy();
});

test("singular count", () => {
  show(1);
  expect(screen.getByText(/1 shell\b/)).toBeTruthy();
});

test("holding the button for the full time confirms once", () => {
  show();
  fireEvent.pointerDown(hold());
  act(() => void vi.advanceTimersByTime(HOLD_MS - 10));
  expect(onConfirm).not.toHaveBeenCalled();
  act(() => void vi.advanceTimersByTime(20));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("releasing early cancels", () => {
  show();
  fireEvent.pointerDown(hold());
  act(() => void vi.advanceTimersByTime(500));
  fireEvent.pointerUp(hold());
  act(() => void vi.advanceTimersByTime(HOLD_MS));
  expect(onConfirm).not.toHaveBeenCalled();
});

test("leaving the button cancels", () => {
  show();
  fireEvent.pointerDown(hold());
  fireEvent.pointerLeave(hold());
  act(() => void vi.advanceTimersByTime(HOLD_MS));
  expect(onConfirm).not.toHaveBeenCalled();
});

test("Enter held works, key repeat does not restart, keyup cancels", () => {
  show();
  fireEvent.keyDown(hold(), { key: "Enter" });
  act(() => void vi.advanceTimersByTime(1000));
  fireEvent.keyDown(hold(), { key: "Enter", repeat: true });
  act(() => void vi.advanceTimersByTime(HOLD_MS - 1000 + 10));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  onConfirm.mockClear();
  fireEvent.keyDown(hold(), { key: "Enter" });
  fireEvent.keyUp(hold(), { key: "Enter" });
  act(() => void vi.advanceTimersByTime(HOLD_MS));
  expect(onConfirm).not.toHaveBeenCalled();
});

test("a plain click does not confirm", () => {
  show();
  fireEvent.click(hold());
  expect(onConfirm).not.toHaveBeenCalled();
});

test("cancel button closes", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalled();
});

test("ring animates for the hold time while holding", () => {
  show();
  expect(hold().getAttribute("data-holding")).toBe("false");
  fireEvent.pointerDown(hold());
  expect(hold().getAttribute("data-holding")).toBe("true");
});
