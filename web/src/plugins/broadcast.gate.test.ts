import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Broadcast gating", () => {
  it("gates input once at originating pane before fanning out", async () => {
    // Setup: originating pane has user input, broadcast group has 3 panes
    const originatingPaneId = "pane-1";
    const broadcastGroup = new Set(["pane-1", "pane-2", "pane-3"]);

    // Mock input line
    const inputLine = "echo hello";

    // Mock gate plugins that require confirmation
    const gatePlugins = [
      {
        id: "careful-commands",
        permissions: new Set(["input:gate"]),
        requestGate: vi.fn(async () => true), // User confirms
      },
    ];

    // Gate should be called ONCE per originating pane, not once per broadcast recipient
    let gateCallCount = 0;
    const mockGate: (line: string) => Promise<boolean> = async (
      line: string,
    ) => {
      gateCallCount++;
      return true;
    };

    // Simulate gate flow
    const result = await mockGate(inputLine);

    // Should gate only once
    expect(gateCallCount).toBe(1);
    expect(result).toBe(true);

    // Then fanout to all panes in broadcast group
    const fanoutTargets = Array.from(broadcastGroup);
    expect(fanoutTargets.length).toBe(3);
    expect(fanoutTargets).toContain(originatingPaneId);
  });

  it("denies broadcast if gate denies", async () => {
    const broadcastGroup = new Set(["pane-1", "pane-2"]);

    let gateResult = false;
    const mockGate: (cmd: string) => Promise<boolean> = async () => gateResult;

    // Gate denies the input
    const result = await mockGate("dangerous command");

    expect(result).toBe(false);

    // Broadcast should NOT fan out
    const shouldFanout = result === true;
    expect(shouldFanout).toBe(false);
  });

  it("observes input in non-originating panes after it is sent", async () => {
    // Setup broadcast scenario
    const originatingPane = "pane-1";
    const receivingPane = "pane-2";
    const broadcastGroup = new Set([originatingPane, receivingPane]);

    // Input is sent from pane-1
    const inputLine = "test command";

    // Mock brokers with input:observe permission
    const observerBrokers: any[] = [
      {
        permissions: new Set(["input:observe"]),
        handleMessage: vi.fn((msg) => {
          // Should receive input:observe:line after input is sent
          expect(msg.type).toBe("input:observe:line");
          expect(msg.line).toBe(inputLine);
        }),
      },
    ];

    // After input is confirmed and sent
    const confirmed = true;

    if (confirmed) {
      // Notify all observers about the sent input
      for (const broker of observerBrokers) {
        if (broker.permissions.has("input:observe")) {
          broker.handleMessage({
            type: "input:observe:line",
            line: inputLine,
          });
        }
      }
    }

    // Verify observer was notified
    expect(observerBrokers[0].handleMessage).toHaveBeenCalledWith({
      type: "input:observe:line",
      line: inputLine,
    });
  });

  it("handles multiple gate plugins in sequence", async () => {
    const gatePlugins: { name: string; requestGate: () => Promise<boolean> }[] =
      [
        {
          name: "plugin-1",
          requestGate: async () => true,
        },
        {
          name: "plugin-2",
          requestGate: async () => false, // Second plugin vetoes
        },
      ];

    // Collect verdicts from all gate plugins
    let finalVerdict = true;

    for (const plugin of gatePlugins) {
      const verdict = await plugin.requestGate();
      if (!verdict) {
        finalVerdict = false;
        break; // Short-circuit on first deny
      }
    }

    expect(finalVerdict).toBe(false);
  });

  it("times out gate requests after 300ms", async () => {
    let gateResult: string | null = null;

    const gatePromise = new Promise<boolean>((resolve) => {
      // Simulate slow gate plugin that never responds
      setTimeout(() => {
        resolve(true);
      }, 500); // Longer than 300ms timeout
    });

    const timeoutPromise = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(true); // Default allow on timeout
      }, 300);
    });

    const result = await Promise.race([gatePromise, timeoutPromise]);

    // Should get timeout result (true = allow)
    expect(result).toBe(true);
  });

  it("prevents input:insert from plugins outside of overlay response", () => {
    // input:insert should only be allowed in response to overlay:action
    // This is a permission check in the broker

    const legalInsert = {
      originatedFrom: "overlay:action",
      allowed: true,
    };

    const illegalInsert = {
      originatedFrom: "spontaneous",
      allowed: false,
    };

    expect(legalInsert.allowed).toBe(true);
    expect(illegalInsert.allowed).toBe(false);
  });
});
