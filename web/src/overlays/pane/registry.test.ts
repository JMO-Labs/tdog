import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPaneOverlay,
  getPaneOverlay,
  getPaneOverlays,
  subscribePaneOverlays,
  type PaneOverlay,
} from "./registry";

describe("pane overlay registry", () => {
  beforeEach(() => {
    // Clear registry between tests by unregistering all overlays
    const overlays = getPaneOverlays();
    overlays.forEach((o) => {
      const unreg = registerPaneOverlay(o);
      unreg();
    });
  });

  it("registers and retrieves an overlay", () => {
    const overlay: PaneOverlay = {
      id: "test-overlay",
      title: "Test overlay",
      render: () => {},
    };

    registerPaneOverlay(overlay);
    expect(getPaneOverlay("test-overlay")).toEqual(overlay);
  });

  it("returns undefined for unregistered overlay", () => {
    expect(getPaneOverlay("nonexistent")).toBeUndefined();
  });

  it("returns all registered overlays", () => {
    const overlay1: PaneOverlay = {
      id: "overlay-1",
      title: "Overlay 1",
      render: () => {},
    };
    const overlay2: PaneOverlay = {
      id: "overlay-2",
      title: "Overlay 2",
      render: () => {},
    };

    registerPaneOverlay(overlay1);
    registerPaneOverlay(overlay2);

    const overlays = getPaneOverlays();
    expect(overlays).toHaveLength(2);
    expect(overlays).toContainEqual(overlay1);
    expect(overlays).toContainEqual(overlay2);
  });

  it("unregisters an overlay", () => {
    const overlay: PaneOverlay = {
      id: "test-overlay",
      title: "Test overlay",
      render: () => {},
    };

    const unreg = registerPaneOverlay(overlay);
    expect(getPaneOverlay("test-overlay")).toEqual(overlay);

    unreg();
    expect(getPaneOverlay("test-overlay")).toBeUndefined();
  });

  it("notifies subscribers on registration", () => {
    let notified = false;
    const unsub = subscribePaneOverlays(() => {
      notified = true;
    });

    const overlay: PaneOverlay = {
      id: "test-overlay",
      title: "Test overlay",
      render: () => {},
    };

    registerPaneOverlay(overlay);
    expect(notified).toBe(true);

    unsub();
  });

  it("notifies subscribers on unregistration", () => {
    const overlay: PaneOverlay = {
      id: "test-overlay",
      title: "Test overlay",
      render: () => {},
    };

    registerPaneOverlay(overlay);

    let notified = false;
    const unsub = subscribePaneOverlays(() => {
      notified = true;
    });

    const unreg = registerPaneOverlay(overlay);
    unreg();
    expect(notified).toBe(true);

    unsub();
  });

  it("unsubscriber stops receiving updates", () => {
    let count = 0;
    const unsub = subscribePaneOverlays(() => {
      count++;
    });

    const overlay1: PaneOverlay = {
      id: "overlay-1",
      title: "Overlay 1",
      render: () => {},
    };

    registerPaneOverlay(overlay1);
    expect(count).toBe(1);

    unsub();

    const overlay2: PaneOverlay = {
      id: "overlay-2",
      title: "Overlay 2",
      render: () => {},
    };

    registerPaneOverlay(overlay2);
    expect(count).toBe(1); // No change after unsubscribe
  });
});
