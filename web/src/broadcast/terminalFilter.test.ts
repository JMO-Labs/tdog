import { describe, it, expect } from "vitest";
import { isTerminalReport, filterTerminalReports } from "./terminalFilter";

describe("terminal report filter", () => {
  describe("isTerminalReport", () => {
    it("identifies cursor position reports", () => {
      expect(isTerminalReport("\x1b[10;20R")).toBe(true);
      expect(isTerminalReport("\x1b[1;1R")).toBe(true);
    });

    it("identifies device attributes (CSI ?)", () => {
      expect(isTerminalReport("\x1b[?1;2c")).toBe(true);
      expect(isTerminalReport("\x1b[?62c")).toBe(true);
    });

    it("identifies device attributes (CSI >)", () => {
      expect(isTerminalReport("\x1b[>0;0;0c")).toBe(true);
    });

    it("identifies focus in event", () => {
      expect(isTerminalReport("\x1b[I")).toBe(true);
    });

    it("identifies focus out event", () => {
      expect(isTerminalReport("\x1b[O")).toBe(true);
    });

    it("identifies X11 mouse reports", () => {
      expect(isTerminalReport("\x1b[M\x20\x40\x40")).toBe(true);
    });

    it("identifies SGR mouse reports", () => {
      expect(isTerminalReport("\x1b[<0;10;20M")).toBe(true);
      expect(isTerminalReport("\x1b[<0;10;20m")).toBe(true);
    });

    it("identifies OSC replies", () => {
      expect(isTerminalReport("\x1b]0;title\x07")).toBe(true);
      expect(isTerminalReport("\x1b]0;title\x1b\\")).toBe(true);
    });

    it("identifies DCS replies", () => {
      expect(isTerminalReport("\x1bP+q41 32\x1b\\")).toBe(true);
    });

    it("allows normal typing", () => {
      expect(isTerminalReport("hello")).toBe(false);
      expect(isTerminalReport("test123!@#")).toBe(false);
    });

    it("allows enter key", () => {
      expect(isTerminalReport("\r")).toBe(false);
      expect(isTerminalReport("\n")).toBe(false);
    });

    it("allows ctrl-c", () => {
      expect(isTerminalReport("\x03")).toBe(false);
    });

    it("allows arrow keys", () => {
      expect(isTerminalReport("\x1b[A")).toBe(false); // Up
      expect(isTerminalReport("\x1b[B")).toBe(false); // Down
      expect(isTerminalReport("\x1b[C")).toBe(false); // Right
      expect(isTerminalReport("\x1b[D")).toBe(false); // Left
    });

    it("allows bracketed paste", () => {
      expect(isTerminalReport("\x1b[200~pasted text\x1b[201~")).toBe(false);
    });

    it("allows function keys and other navigation", () => {
      expect(isTerminalReport("\x1b[1~")).toBe(false); // Home
      expect(isTerminalReport("\x1b[4~")).toBe(false); // End
      expect(isTerminalReport("\x1b[5~")).toBe(false); // Page Up
      expect(isTerminalReport("\x1b[6~")).toBe(false); // Page Down
    });

    it("handles both string and Uint8Array", () => {
      const str = "\x1b[10;20R";
      const bytes = new TextEncoder().encode(str);

      expect(isTerminalReport(str)).toBe(true);
      expect(isTerminalReport(bytes)).toBe(true);
    });
  });

  describe("filterTerminalReports", () => {
    it("removes terminal reports", () => {
      const report = new TextEncoder().encode("\x1b[10;20R");
      const filtered = filterTerminalReports(report);
      expect(filtered.length).toBe(0);
    });

    it("preserves user input", () => {
      const input = new TextEncoder().encode("hello");
      const filtered = filterTerminalReports(input);
      expect(new TextDecoder().decode(filtered)).toBe("hello");
    });

    it("preserves control input like arrow keys", () => {
      const input = new TextEncoder().encode("\x1b[A");
      const filtered = filterTerminalReports(input);
      expect(new TextDecoder().decode(filtered)).toBe("\x1b[A");
    });
  });
});
