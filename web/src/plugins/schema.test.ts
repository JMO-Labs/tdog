import { describe, it, expect } from "vitest";
import {
  isValidPluginMessage,
  isValidHostMessage,
  type PluginMessage,
  type HostMessage,
} from "./schema";

describe("schema validation", () => {
  describe("isValidPluginMessage", () => {
    it("accepts ready message", () => {
      const msg: PluginMessage = {
        type: "ready",
        permissions: ["screen:read"],
      };
      expect(isValidPluginMessage(msg)).toBe(true);
    });

    it("accepts screen:read:request", () => {
      const msg: PluginMessage = {
        type: "screen:read:request",
        id: "req1",
      };
      expect(isValidPluginMessage(msg)).toBe(true);
    });

    it("accepts input:gate:request", () => {
      const msg: PluginMessage = {
        type: "input:gate:request",
        id: "req1",
        line: "rm -rf /",
      };
      expect(isValidPluginMessage(msg)).toBe(true);
    });

    it("accepts overlay:render", () => {
      const msg: PluginMessage = {
        type: "overlay:render",
        tree: { kind: "text", text: "Hello" },
      };
      expect(isValidPluginMessage(msg)).toBe(true);
    });

    it("rejects unknown type", () => {
      expect(isValidPluginMessage({ type: "unknown" })).toBe(false);
    });

    it("rejects non-object", () => {
      expect(isValidPluginMessage("string")).toBe(false);
      expect(isValidPluginMessage(null)).toBe(false);
      expect(isValidPluginMessage(undefined)).toBe(false);
    });
  });

  describe("isValidHostMessage", () => {
    it("accepts screen:read:response", () => {
      const msg: HostMessage = {
        type: "screen:read:response",
        id: "req1",
        lines: ["line1", "line2"],
      };
      expect(isValidHostMessage(msg)).toBe(true);
    });

    it("accepts input:gate:response", () => {
      const msg: HostMessage = {
        type: "input:gate:response",
        id: "req1",
        verdict: "allow",
      };
      expect(isValidHostMessage(msg)).toBe(true);
    });

    it("accepts overlay:action", () => {
      const msg: HostMessage = {
        type: "overlay:action",
        id: "req1",
        action: "button",
        elementId: "btn1",
      };
      expect(isValidHostMessage(msg)).toBe(true);
    });

    it("rejects plugin message type", () => {
      expect(isValidHostMessage({ type: "ready" })).toBe(false);
    });
  });
});
