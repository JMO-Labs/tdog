import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginBroker, type BrokerContext } from "./broker";
import type { PluginMessage, HostMessage } from "./schema";

describe("PluginBroker", () => {
  let ctx: BrokerContext;

  beforeEach(() => {
    ctx = {
      getScreen: vi.fn(() => ["line1", "line2"]),
      requestGate: vi.fn(async () => true),
      renderOverlay: vi.fn(async () => {}),
      dismissOverlay: vi.fn(),
    };
  });

  describe("permission gating", () => {
    it("grants screen:read with permission", () => {
      // Simulate broker receiving a message with screen:read permission
      const receivedMessages: HostMessage[] = [];
      const mockPort = {
        onmessage: null as any,
        postMessage: (msg: unknown) =>
          receivedMessages.push(msg as HostMessage),
        start: () => {},
        close: () => {},
      };

      const broker = new PluginBroker(mockPort as any, ["screen:read"], ctx);
      broker.start();

      // Manually trigger the message handler
      const msg: PluginMessage = {
        type: "screen:read:request",
        id: "req1",
      };
      mockPort.onmessage(new MessageEvent("message", { data: msg }));

      expect(receivedMessages.length).toBe(1);
      const resp = receivedMessages[0];
      expect(resp.type).toBe("screen:read:response");
      if (resp.type === "screen:read:response") {
        expect(resp.lines).toEqual(["line1", "line2"]);
      }
    });

    it("denies permission without grant", () => {
      const receivedMessages: HostMessage[] = [];
      const mockPort = {
        onmessage: null as any,
        postMessage: (msg: unknown) =>
          receivedMessages.push(msg as HostMessage),
        start: () => {},
        close: () => {},
      };

      const broker = new PluginBroker(mockPort as any, [], ctx); // No permissions
      broker.start();

      const msg: PluginMessage = {
        type: "screen:read:request",
        id: "req1",
      };
      mockPort.onmessage(new MessageEvent("message", { data: msg }));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].type).toBe("error");
      if (receivedMessages[0].type === "error") {
        expect(receivedMessages[0].error).toContain("Permission denied");
      }
    });

    it("rejects invalid message schema", () => {
      const receivedMessages: HostMessage[] = [];
      const mockPort = {
        onmessage: null as any,
        postMessage: (msg: unknown) =>
          receivedMessages.push(msg as HostMessage),
        start: () => {},
        close: () => {},
      };

      const broker = new PluginBroker(mockPort as any, ["screen:read"], ctx);
      broker.start();

      const msg = { type: "unknown:message" };
      mockPort.onmessage(new MessageEvent("message", { data: msg }));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].type).toBe("error");
    });
  });

  describe("input:gate flow", () => {
    it("calls requestGate on gate request", async () => {
      const receivedMessages: HostMessage[] = [];
      const mockPort = {
        onmessage: null as any,
        postMessage: (msg: unknown) =>
          receivedMessages.push(msg as HostMessage),
        start: () => {},
        close: () => {},
      };

      const broker = new PluginBroker(mockPort as any, ["input:gate"], ctx);
      broker.start();

      const msg: PluginMessage = {
        type: "input:gate:request",
        id: "req1",
        line: "rm -rf /",
      };
      mockPort.onmessage(new MessageEvent("message", { data: msg }));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(ctx.requestGate).toHaveBeenCalledWith(
        "rm -rf /",
        expect.any(String),
      );
    });

    it("times out gate request after 300ms", async () => {
      const receivedMessages: HostMessage[] = [];
      const mockPort = {
        onmessage: null as any,
        postMessage: (msg: unknown) =>
          receivedMessages.push(msg as HostMessage),
        start: () => {},
        close: () => {},
      };

      const neverResolves = vi.fn(async (): Promise<boolean> => {
        return await new Promise(() => {}); // Never resolves
      });

      const slowCtx: BrokerContext = {
        getScreen: vi.fn(() => []),
        requestGate: neverResolves,
        renderOverlay: vi.fn(),
        dismissOverlay: vi.fn(),
      };

      const broker = new PluginBroker(mockPort as any, ["input:gate"], slowCtx);
      broker.start();

      const msg: PluginMessage = {
        type: "input:gate:request",
        id: "req1",
        line: "ls",
      };
      mockPort.onmessage(new MessageEvent("message", { data: msg }));

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(receivedMessages.length).toBe(1);
      const resp = receivedMessages[0];
      expect(resp.type).toBe("input:gate:response");
      if (resp.type === "input:gate:response") {
        expect(resp.verdict).toBe("allow"); // Timeout = allow
      }
    });
  });

  describe("rate limiting and size enforcement", () => {
    it("terminates plugin on oversized message", () => {
      const mockPort = {
        onmessage: null as any,
        postMessage: () => {},
        start: () => {},
        close: vi.fn(),
      };

      const mockCtx: BrokerContext = {
        ...ctx,
        onPluginError: vi.fn(),
      };

      const broker = new PluginBroker(
        mockPort as any,
        ["screen:read"],
        mockCtx,
      );
      broker.start();

      // Create oversized message (65KB)
      const largeString = "x".repeat(65 * 1024);
      const msg = {
        type: "screen:read:request",
        id: "req1",
        data: largeString,
      };
      mockPort.onmessage(new MessageEvent("message", { data: msg }));

      expect(mockCtx.onPluginError).toHaveBeenCalledWith("Message too large");
      expect(mockPort.close).toHaveBeenCalled();
    });

    it("terminates plugin on rate limit exceeded", () => {
      const mockPort = {
        onmessage: null as any,
        postMessage: () => {},
        start: () => {},
        close: vi.fn(),
      };

      const mockCtx: BrokerContext = {
        ...ctx,
        onPluginError: vi.fn(),
      };

      const broker = new PluginBroker(
        mockPort as any,
        ["screen:read"],
        mockCtx,
      );
      broker.start();

      // Send 51 messages (limit is 50/sec)
      for (let i = 0; i < 51; i++) {
        const msg: PluginMessage = {
          type: "screen:read:request",
          id: `req${i}`,
        };
        mockPort.onmessage(new MessageEvent("message", { data: msg }));
      }

      expect(mockCtx.onPluginError).toHaveBeenCalledWith(
        "Rate limit exceeded: too many messages",
      );
      expect(mockPort.close).toHaveBeenCalled();
    });

    it("allows well-behaved plugin with many messages", () => {
      const receivedMessages: HostMessage[] = [];
      const mockPort = {
        onmessage: null as any,
        postMessage: (msg: unknown) =>
          receivedMessages.push(msg as HostMessage),
        start: () => {},
        close: vi.fn(),
      };

      const mockCtx: BrokerContext = {
        ...ctx,
        onPluginError: vi.fn(),
      };

      const broker = new PluginBroker(
        mockPort as any,
        ["screen:read"],
        mockCtx,
      );
      broker.start();

      // Send 50 valid messages (within limit)
      for (let i = 0; i < 50; i++) {
        const msg: PluginMessage = {
          type: "screen:read:request",
          id: `req${i}`,
        };
        mockPort.onmessage(new MessageEvent("message", { data: msg }));
      }

      expect(mockCtx.onPluginError).not.toHaveBeenCalled();
      expect(mockPort.close).not.toHaveBeenCalled();
      expect(receivedMessages.length).toBe(50);
    });

    it("rejects cyclic references", () => {
      const mockPort = {
        onmessage: null as any,
        postMessage: () => {},
        start: () => {},
        close: vi.fn(),
      };

      const mockCtx: BrokerContext = {
        ...ctx,
        onPluginError: vi.fn(),
      };

      const broker = new PluginBroker(
        mockPort as any,
        ["screen:read"],
        mockCtx,
      );
      broker.start();

      // Create cyclic reference
      const msg: any = { type: "screen:read:request", id: "req1" };
      msg.self = msg; // Cyclic

      mockPort.onmessage(new MessageEvent("message", { data: msg }));

      expect(mockCtx.onPluginError).toHaveBeenCalledWith("Message too large");
    });
  });
});
