import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toggleBroadcast, getBroadcastGroup, __clearAllState } from "./store";
import { useBroadcast } from "./useBroadcast";

describe("useBroadcast hook", () => {
  beforeEach(() => {
    localStorage.clear();
    __clearAllState();
  });

  afterEach(() => {
    localStorage.clear();
    __clearAllState();
  });

  it("returns initial broadcast state as false", () => {
    const { result } = renderHook(() => useBroadcast("scene1", "pane1"));
    expect(result.current.isBroadcasting).toBe(false);
  });

  it("returns initial broadcast state as true if pane in group", () => {
    toggleBroadcast("scene1", "pane1");
    const { result } = renderHook(() => useBroadcast("scene1", "pane1"));
    expect(result.current.isBroadcasting).toBe(true);
  });

  it("toggles broadcast state when toggle() called", async () => {
    const { result } = renderHook(() => useBroadcast("scene1", "pane1"));
    expect(result.current.isBroadcasting).toBe(false);
    await act(() => result.current.toggle());
    expect(result.current.isBroadcasting).toBe(true);
  });

  it("reflects store changes via subscription", async () => {
    const { result } = renderHook(() => useBroadcast("scene1", "pane1"));
    expect(result.current.isBroadcasting).toBe(false);
    await act(() => toggleBroadcast("scene1", "pane1"));
    expect(result.current.isBroadcasting).toBe(true);
  });

  it("cleans up pane from group on unmount if broadcasting", async () => {
    toggleBroadcast("scene1", "pane1");
    const { unmount } = renderHook(() => useBroadcast("scene1", "pane1"));
    expect(getBroadcastGroup("scene1")).toContain("pane1");
    unmount();
    expect(getBroadcastGroup("scene1")).not.toContain("pane1");
  });

  it("does not clean up if not broadcasting on unmount", async () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene1", "pane1"); // Remove it
    const { unmount } = renderHook(() => useBroadcast("scene1", "pane1"));
    expect(getBroadcastGroup("scene1").size).toBe(0);
    unmount();
    expect(getBroadcastGroup("scene1").size).toBe(0);
  });

  it("handles multiple panes independently", async () => {
    const { result: result1 } = renderHook(() =>
      useBroadcast("scene1", "pane1"),
    );
    const { result: result2 } = renderHook(() =>
      useBroadcast("scene1", "pane2"),
    );
    await act(() => result1.current.toggle());
    expect(result1.current.isBroadcasting).toBe(true);
    expect(result2.current.isBroadcasting).toBe(false);
  });
});
