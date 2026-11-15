import { describe, it, expect, beforeEach } from "vitest";
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
  });

  it("toggles broadcast on and off", () => {
    const scene = "scene1";
    const pane = "pane1";

    expect(getBroadcastGroup(scene).has(pane)).toBe(false);

    toggleBroadcast(scene, pane);
    expect(getBroadcastGroup(scene).has(pane)).toBe(true);

    toggleBroadcast(scene, pane);
    expect(getBroadcastGroup(scene).has(pane)).toBe(false);
  });

  it("adds multiple panes to a scene group", () => {
    const scene = "scene1";

    toggleBroadcast(scene, "pane1");
    toggleBroadcast(scene, "pane2");
    toggleBroadcast(scene, "pane3");

    const group = getBroadcastGroup(scene);
    expect(group.size).toBe(3);
    expect(group.has("pane1")).toBe(true);
    expect(group.has("pane2")).toBe(true);
    expect(group.has("pane3")).toBe(true);
  });

  it("clears a pane from its group", () => {
    const scene = "scene1";

    toggleBroadcast(scene, "pane1");
    toggleBroadcast(scene, "pane2");

    clearPane(scene, "pane1");

    const group = getBroadcastGroup(scene);
    expect(group.size).toBe(1);
    expect(group.has("pane1")).toBe(false);
    expect(group.has("pane2")).toBe(true);
  });

  it("clears an entire scene", () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene1", "pane2");
    toggleBroadcast("scene2", "pane3");

    clearScene("scene1");

    expect(getBroadcastGroup("scene1").size).toBe(0);
    expect(getBroadcastGroup("scene2").size).toBe(1);
  });

  it("notifies subscribers of changes", () => {
    const scene = "scene1";
    const notifications: number[] = [];

    const store = getBroadcastStore();
    const unsubscribe = store.subscribe(() => {
      notifications.push(notifications.length);
    });

    toggleBroadcast(scene, "pane1");
    toggleBroadcast(scene, "pane2");
    clearPane(scene, "pane1");

    expect(notifications).toEqual([0, 1, 2]);

    unsubscribe();
    toggleBroadcast(scene, "pane3");
    expect(notifications).toEqual([0, 1, 2]);
  });

  it("maintains separate groups per scene", () => {
    toggleBroadcast("scene1", "pane1");
    toggleBroadcast("scene2", "pane1");

    const group1 = getBroadcastGroup("scene1");
    const group2 = getBroadcastGroup("scene2");

    expect(group1.size).toBe(1);
    expect(group2.size).toBe(1);
    expect(group1.has("pane1")).toBe(true);
    expect(group2.has("pane1")).toBe(true);
  });
});
