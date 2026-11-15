import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  toggleBroadcast,
  clearPane,
  clearScene,
  getBroadcastGroup,
  getBroadcastStore,
  __clearAllState,
} from "./store";

describe("broadcast store", () => {
  beforeEach(() => {
    __clearAllState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __clearAllState();
  });

  it("toggles a pane into broadcast group", () => {
    toggleBroadcast("scene1", "pane1");
    expect(getBroadcastGroup("scene1")).toContain("pane1");
  });

  it("toggles a pane out of broadcast group", () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene1", "pane1");
    expect(getBroadcastGroup("scene1")).not.toContain("pane1");
  });

  it("handles multiple panes in one scene", () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene1", "pane2");
    expect(getBroadcastGroup("scene1").size).toBe(2);
    expect(getBroadcastGroup("scene1")).toContain("pane1");
    expect(getBroadcastGroup("scene1")).toContain("pane2");
  });

  it("isolates groups by scene", () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene2", "pane1");
    expect(getBroadcastGroup("scene1").size).toBe(1);
    expect(getBroadcastGroup("scene2").size).toBe(1);
  });

  it("clears a specific pane on close", () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene1", "pane2");
    clearPane("scene1", "pane1");
    expect(getBroadcastGroup("scene1")).toEqual(new Set(["pane2"]));
  });

  it("clears entire group when scene closes", () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene1", "pane2");
    clearScene("scene1");
    expect(getBroadcastGroup("scene1").size).toBe(0);
  });

  it("notifies subscribers on changes", () => {
    const store = getBroadcastStore();
    const callback = vi.fn();
    store.subscribe(callback);
    toggleBroadcast("scene1", "pane1");
    expect(callback).toHaveBeenCalled();
  });

  it("removes listener when unsubscribe called", () => {
    const store = getBroadcastStore();
    const callback = vi.fn();
    const unsub = store.subscribe(callback);
    unsub();
    toggleBroadcast("scene1", "pane1");
    expect(callback).not.toHaveBeenCalled();
  });
});
