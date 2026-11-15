import { describe, it, expect, beforeEach } from "vitest";
import {
  toggleBroadcast,
  getBroadcastGroup,
  getBroadcastStore,
  __clearAllState,
} from "./store";
import {
  registerPaneInput,
  unregisterPaneInput,
  getScenePanes,
  __clearAllEntries,
} from "./sessionRegistry";

describe("broadcast fan-out", () => {
  beforeEach(() => {
    __clearAllState();
    __clearAllEntries();
  });

  it("fans out input to broadcast group except sender", () => {
    const scene = "scene1";
    const senderPane = "paneA";
    const receiverPane1 = "paneB";
    const receiverPane2 = "paneC";
    const outsidePane = "paneD";

    const inputs: { [pane: string]: string[] } = {
      paneA: [],
      paneB: [],
      paneC: [],
      paneD: [],
    };

    // Register pane input handlers
    for (const pane of Object.keys(inputs)) {
      registerPaneInput(scene, pane, (data) => {
        inputs[pane].push(new TextDecoder().decode(data));
      });
    }

    // Enable broadcast for A, B, C (but not D)
    toggleBroadcast(scene, senderPane);
    toggleBroadcast(scene, receiverPane1);
    toggleBroadcast(scene, receiverPane2);

    // Simulate A sending input
    const testData = new TextEncoder().encode("hello");
    const panes = getScenePanes(scene);
    const group = getBroadcastGroup(scene);

    // Simulate the broadcast logic: sender gets input, fan out to group except sender
    group.forEach((targetPaneId) => {
      if (targetPaneId === senderPane) return; // Don't echo back to sender
      const targetPane = panes[targetPaneId];
      if (targetPane) {
        targetPane.send(testData);
      }
    });

    // Verify results
    expect(inputs.paneA).toEqual([]); // Sender doesn't receive
    expect(inputs.paneB).toEqual(["hello"]); // Receiver gets input
    expect(inputs.paneC).toEqual(["hello"]); // Receiver gets input
    expect(inputs.paneD).toEqual([]); // Outside pane doesn't get input
  });

  it("handles pane removal from group", () => {
    const scene = "scene1";

    toggleBroadcast(scene, "pane1");
    toggleBroadcast(scene, "pane2");
    toggleBroadcast(scene, "pane3");

    expect(getBroadcastGroup(scene).size).toBe(3);

    // Remove pane2 from both registry and broadcast
    unregisterPaneInput(scene, "pane2");
    toggleBroadcast(scene, "pane2");

    expect(getBroadcastGroup(scene).size).toBe(2);

    const inputs: { [pane: string]: string[] } = {};
    for (const pane of ["pane1", "pane2", "pane3"]) {
      inputs[pane] = [];
      registerPaneInput(scene, pane, (data) => {
        inputs[pane].push(new TextDecoder().decode(data));
      });
    }

    // Broadcast from pane1
    const testData = new TextEncoder().encode("test");
    const panes = getScenePanes(scene);
    const group = getBroadcastGroup(scene);

    group.forEach((targetPaneId) => {
      if (targetPaneId === "pane1") return;
      const targetPane = panes[targetPaneId];
      if (targetPane) {
        targetPane.send(testData);
      }
    });

    expect(inputs.pane1).toEqual([]); // Sender doesn't receive
    expect(inputs.pane2).toEqual([]); // Removed pane doesn't receive
    expect(inputs.pane3).toEqual(["test"]); // Only remaining pane receives
  });

  it("broadcasts paste input exactly once per target", () => {
    const scene = "scene1";

    const receivedCounts: { [pane: string]: number } = {
      pane1: 0,
      pane2: 0,
      pane3: 0,
    };

    // Register handlers that count invocations
    registerPaneInput(scene, "pane1", () => {
      receivedCounts.pane1++;
    });
    registerPaneInput(scene, "pane2", () => {
      receivedCounts.pane2++;
    });
    registerPaneInput(scene, "pane3", () => {
      receivedCounts.pane3++;
    });

    // Enable broadcast for all
    toggleBroadcast(scene, "pane1");
    toggleBroadcast(scene, "pane2");
    toggleBroadcast(scene, "pane3");

    // Paste from pane1
    const pasteData = new TextEncoder().encode("pasted text");
    const panes = getScenePanes(scene);
    const group = getBroadcastGroup(scene);

    group.forEach((targetPaneId) => {
      if (targetPaneId === "pane1") return;
      const targetPane = panes[targetPaneId];
      if (targetPane) {
        targetPane.send(pasteData);
      }
    });

    // Each target should receive exactly once
    expect(receivedCounts.pane1).toBe(0); // Sender doesn't receive
    expect(receivedCounts.pane2).toBe(1); // Received exactly once
    expect(receivedCounts.pane3).toBe(1); // Received exactly once
  });

  it("toggles broadcast state correctly", () => {
    const scene = "scene1";
    const pane = "pane1";

    // Register pane
    registerPaneInput(scene, pane, () => {});

    // Initially not broadcasting
    expect(getBroadcastGroup(scene).has(pane)).toBe(false);

    // Toggle on
    toggleBroadcast(scene, pane);
    expect(getBroadcastGroup(scene).has(pane)).toBe(true);

    // Toggle off
    toggleBroadcast(scene, pane);
    expect(getBroadcastGroup(scene).has(pane)).toBe(false);
  });

  it("notifies subscribers when broadcast state changes", () => {
    const scene = "scene1";
    const pane = "pane1";
    const notifications: number[] = [];

    registerPaneInput(scene, pane, () => {});

    const store = getBroadcastStore();
    store.subscribe(() => {
      notifications.push(getBroadcastGroup(scene).size);
    });

    toggleBroadcast(scene, pane); // size = 1
    toggleBroadcast(scene, pane); // size = 0

    expect(notifications).toEqual([1, 0]);
  });
});
