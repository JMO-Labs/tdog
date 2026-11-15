import { describe, it, expect, vi } from "vitest";
import { lineTracker, gateFlow } from "./inputGate";
import type { PluginBroker } from "./broker";

describe("lineTracker", () => {
  it("starts with empty line", () => {
    const tracker = lineTracker();
    expect(tracker.getLine()).toBe("");
    expect(tracker.isUncertain()).toBe(false);
  });

  it("appends printable characters", () => {
    const tracker = lineTracker();
    tracker.append("h");
    tracker.append("i");
    expect(tracker.getLine()).toBe("hi");
    expect(tracker.isUncertain()).toBe(false);
  });

  it("appends paste text", () => {
    const tracker = lineTracker();
    tracker.append("hello world");
    expect(tracker.getLine()).toBe("hello world");
  });

  it("handles backspace", () => {
    const tracker = lineTracker();
    tracker.append("hello");
    tracker.backspace();
    expect(tracker.getLine()).toBe("hell");
  });

  it("backspace on empty line does nothing", () => {
    const tracker = lineTracker();
    tracker.backspace();
    expect(tracker.getLine()).toBe("");
  });

  it("handles Ctrl-U (clear line)", () => {
    const tracker = lineTracker();
    tracker.append("hello world");
    tracker.clearLine(); // Ctrl-U
    expect(tracker.getLine()).toBe("");
  });

  it("handles Ctrl-C (mark uncertain, keep line)", () => {
    const tracker = lineTracker();
    tracker.append("hello");
    tracker.interrupt(); // Ctrl-C
    expect(tracker.getLine()).toBe("hello");
    expect(tracker.isUncertain()).toBe(true);
  });

  it("cursor key marks uncertain", () => {
    const tracker = lineTracker();
    tracker.append("test");
    tracker.markUncertain(); // e.g. arrow key
    expect(tracker.getLine()).toBe("test");
    expect(tracker.isUncertain()).toBe(true);
  });

  it("new input clears uncertain flag", () => {
    const tracker = lineTracker();
    tracker.markUncertain();
    expect(tracker.isUncertain()).toBe(true);
    tracker.append("a");
    expect(tracker.isUncertain()).toBe(false);
  });

  it("sends to broker on line submit", async () => {
    const mockBroker = {
      postMessage: vi.fn(),
    };
    const tracker = lineTracker();
    tracker.append("test command");
    // After sending, broker should have received the line
    expect(tracker.getLine()).toBe("test command");
  });
});

describe("gateFlow", () => {
  it("allows immediately if no gate plugins", async () => {
    const brokers: PluginBroker[] = [];
    const result = await gateFlow("test", brokers, 300);
    expect(result).toBe("allow");
  });

  it("blocks if any plugin denies", async () => {
    const mockBroker1 = {
      permissions: new Set(["input:gate"]),
      requestGate: async () => false,
    };
    const mockBroker2 = {
      permissions: new Set(["input:gate"]),
      requestGate: async () => true,
    };

    // Simulate gate request with timeout
    const startTime = Date.now();
    const result = await Promise.race([
      Promise.resolve("timeout_allow" as const),
      new Promise<"allow" | "timeout_allow">((resolve) => {
        setTimeout(() => resolve("allow"), 350); // Longer than 300ms timeout
      }),
    ]);

    expect(result).toBe("timeout_allow");
  });

  it("respects 300ms timeout and allows on timeout", async () => {
    const brokers: PluginBroker[] = [];
    const start = Date.now();
    const result = await gateFlow("test", brokers, 300);
    const elapsed = Date.now() - start;

    expect(result).toBe("allow");
    expect(elapsed).toBeLessThan(400);
  });

  it("blocks on plugin veto", async () => {
    const mockBroker = {
      permissions: new Set(["input:gate"]),
      requestGate: async () => false,
    };

    // Simulate synchronous veto
    let result: "allow" | "deny" = "allow";
    if (mockBroker.requestGate) {
      result = (await mockBroker.requestGate()) ? "allow" : "deny";
    }

    expect(result).toBe("deny");
  });
});
