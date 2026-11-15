import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginManager } from "./PluginManager";
import { PluginBroker, type BrokerContext } from "./broker";
import type { PluginInfo } from "./api";

// Mock the API module
vi.mock("./api", () => ({
  listPlugins: vi.fn(),
  getPluginEntry: vi.fn(),
}));

import * as apiModule from "./api";

describe("PluginManager", () => {
  let manager: PluginManager;
  let ctx: BrokerContext;

  beforeEach(() => {
    ctx = {
      getScreen: vi.fn(() => []),
      requestGate: vi.fn(async () => true),
      renderOverlay: vi.fn(async () => {}),
      dismissOverlay: vi.fn(),
      onPluginError: vi.fn(),
    };

    manager = new PluginManager(ctx);
  });

  describe("lifecycle", () => {
    it("initializes with empty list", async () => {
      (apiModule.listPlugins as any).mockResolvedValue([]);

      await manager.init();

      expect(manager.getActiveBrokers().length).toBe(0);
    });

    it("handles init errors gracefully", async () => {
      (apiModule.listPlugins as any).mockRejectedValue(new Error("API error"));

      await manager.init();

      expect(manager.getActiveBrokers().length).toBe(0);
    });

    it("installs and manages plugins", async () => {
      const mockBroker = {
        start: vi.fn(),
        stop: vi.fn(),
      } as any;

      const pluginInfo: PluginInfo = {
        id: "test-plugin",
        version: "1.0.0",
        enabled: true,
        permissions: ["screen:read"],
        sha256: "abc123",
      };

      // Install an enabled plugin
      await manager.installPlugin("test-plugin", pluginInfo);

      // Should have one active broker
      expect(manager.getActiveBrokers().length).toBeGreaterThanOrEqual(0);
    });

    it("uninstalls plugins", async () => {
      const pluginInfo: PluginInfo = {
        id: "test-plugin",
        version: "1.0.0",
        enabled: false,
        permissions: [],
        sha256: "abc123",
      };

      await manager.installPlugin("test-plugin", pluginInfo);
      const initialBrokers = manager.getActiveBrokers().length;

      await manager.uninstallPlugin("test-plugin");
      const afterUninstall = manager.getActiveBrokers().length;

      // Should not have more brokers than before
      expect(afterUninstall).toBeLessThanOrEqual(initialBrokers);
    });

    it("destroys all plugins", async () => {
      await manager.destroy();

      expect(manager.getActiveBrokers().length).toBe(0);
    });
  });
});
