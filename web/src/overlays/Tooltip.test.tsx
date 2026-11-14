import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "./Tooltip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Tooltip", () => {
  it("shows label and kbd after the delay, hides on leave", () => {
    render(
      <Tooltip label="Close" shortcut="Esc">
        <button>x</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("x"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => void vi.advanceTimersByTime(400));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("Close");
    expect(tip.querySelector("kbd")!.textContent).toBe("Esc");
    fireEvent.mouseLeave(screen.getByText("x"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("opens on focus", () => {
    render(
      <Tooltip label="Hi">
        <button>x</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByText("x"));
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
  it("hides on blur", () => {
    render(
      <Tooltip label="Hi">
        <button>x</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByText("x"));
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.blur(screen.getByText("x"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("forwards an object ref on the child", () => {
    const r = createRef<HTMLButtonElement>();
    render(
      <Tooltip label="Hi">
        <button ref={r}>x</button>
      </Tooltip>,
    );
    expect(r.current).toBe(screen.getByText("x"));
  });
});
