import { describe, it, expect } from "vitest";
import { isBroadcastable, filterTerminalReports } from "./terminalFilter";

describe("terminal report allowlist filter", () => {
  describe("Allowed user input (broadcastable)", () => {
    it("allows normal typing", () => {
      expect(isBroadcastable("hello")).toBe(true);
      expect(isBroadcastable("test123!@#$%^&*()")).toBe(true);
      expect(isBroadcastable("🎉")).toBe(true); // UTF-8
    });

    it("allows line ending keys", () => {
      expect(isBroadcastable("\r")).toBe(true);
      expect(isBroadcastable("\n")).toBe(true);
      expect(isBroadcastable("line\r\n")).toBe(true);
    });

    it("allows control characters user keys produce", () => {
      expect(isBroadcastable("\x03")).toBe(true); // Ctrl-C
      expect(isBroadcastable("\x04")).toBe(true); // Ctrl-D
      expect(isBroadcastable("\x1a")).toBe(true); // Ctrl-Z
      expect(isBroadcastable("\t")).toBe(true); // Tab
      expect(isBroadcastable("\x08")).toBe(true); // Backspace
      expect(isBroadcastable("\x7f")).toBe(true); // DEL
    });

    it("allows arrow keys", () => {
      expect(isBroadcastable("\x1b[A")).toBe(true); // Up
      expect(isBroadcastable("\x1b[B")).toBe(true); // Down
      expect(isBroadcastable("\x1b[C")).toBe(true); // Right
      expect(isBroadcastable("\x1b[D")).toBe(true); // Left
    });

    it("allows home/end keys", () => {
      expect(isBroadcastable("\x1b[H")).toBe(true); // Home
      expect(isBroadcastable("\x1b[F")).toBe(true); // End
    });

    it("allows function keys (F1-F24)", () => {
      expect(isBroadcastable("\x1b[1~")).toBe(true); // F1
      expect(isBroadcastable("\x1b[24~")).toBe(true); // F24
      expect(isBroadcastable("\x1b[11~")).toBe(true); // F1 (alternate)
    });

    it("allows function keys with modifiers", () => {
      expect(isBroadcastable("\x1b[1;2~")).toBe(true); // Shift-F1
      expect(isBroadcastable("\x1b[1;3~")).toBe(true); // Alt-F1
      expect(isBroadcastable("\x1b[1;4~")).toBe(true); // Shift-Alt-F1
      expect(isBroadcastable("\x1b[1;5~")).toBe(true); // Ctrl-F1
    });

    it("allows shift-tab", () => {
      expect(isBroadcastable("\x1b[Z")).toBe(true);
    });

    it("allows SS3 forms (alternate cursor keys)", () => {
      expect(isBroadcastable("\x1bOA")).toBe(true); // Up
      expect(isBroadcastable("\x1bOB")).toBe(true); // Down
      expect(isBroadcastable("\x1bOC")).toBe(true); // Right
      expect(isBroadcastable("\x1bOD")).toBe(true); // Left
      expect(isBroadcastable("\x1bOH")).toBe(true); // Home
      expect(isBroadcastable("\x1bOF")).toBe(true); // End
      expect(isBroadcastable("\x1bOP")).toBe(true); // F1
      expect(isBroadcastable("\x1bOS")).toBe(true); // F4
    });

    it("allows Alt+key", () => {
      expect(isBroadcastable("\x1ba")).toBe(true); // Alt-a
      expect(isBroadcastable("\x1b1")).toBe(true); // Alt-1
      expect(isBroadcastable("\x1b!")).toBe(true); // Alt-!
      expect(isBroadcastable("text\x1btext")).toBe(true); // "text" + Alt-t + "ext"
    });

    it("allows complete bracketed paste", () => {
      expect(isBroadcastable("\x1b[200~hello\x1b[201~")).toBe(true);
      expect(isBroadcastable("\x1b[200~line1\nline2\nline3\x1b[201~")).toBe(
        true,
      );
      expect(isBroadcastable("\x1b[200~with\ttabs\x1b[201~")).toBe(true);
    });

    it("allows mixed input", () => {
      expect(isBroadcastable("hello\x1b[A\x03world")).toBe(true);
      expect(isBroadcastable("type\x1b[1~more")).toBe(true);
    });
  });

  describe("Blocked terminal reports (not broadcastable)", () => {
    it("blocks cursor position reports", () => {
      expect(isBroadcastable("\x1b[10;20R")).toBe(false);
      expect(isBroadcastable("\x1b[1;1R")).toBe(false);
    });

    it("blocks device attributes (CSI ?)", () => {
      expect(isBroadcastable("\x1b[?1;2c")).toBe(false);
      expect(isBroadcastable("\x1b[?62c")).toBe(false);
    });

    it("blocks device attributes (CSI >)", () => {
      expect(isBroadcastable("\x1b[>0;0;0c")).toBe(false);
    });

    it("blocks focus in/out", () => {
      expect(isBroadcastable("\x1b[I")).toBe(false); // Focus in
      expect(isBroadcastable("\x1b[O")).toBe(false); // Focus out (SS3 prefix would be allowed, but plain CSI is not)
    });

    it("blocks X11 mouse reports", () => {
      expect(isBroadcastable("\x1b[M\x20\x40\x40")).toBe(false);
    });

    it("blocks SGR mouse reports", () => {
      expect(isBroadcastable("\x1b[<0;10;20M")).toBe(false);
      expect(isBroadcastable("\x1b[<0;10;20m")).toBe(false);
    });

    it("blocks OSC sequences", () => {
      expect(isBroadcastable("\x1b]0;title\x07")).toBe(false); // BEL
      expect(isBroadcastable("\x1b]0;title\x1b\\")).toBe(false); // ST
    });

    it("blocks DCS sequences", () => {
      expect(isBroadcastable("\x1bP+q41 32\x1b\\")).toBe(false);
    });

    it("blocks incomplete CSI sequences", () => {
      expect(isBroadcastable("\x1b[")).toBe(false);
      expect(isBroadcastable("\x1b[1")).toBe(false); // No final byte
    });

    it("blocks incomplete paste spans", () => {
      expect(isBroadcastable("\x1b[200~but no end")).toBe(false);
      expect(isBroadcastable("text \x1b[200~incomplete")).toBe(false);
    });

    it("blocks paste containing ESC (would hide other sequences)", () => {
      expect(isBroadcastable("\x1b[200~pasted\x1b[Atext\x1b[201~")).toBe(false);
      expect(isBroadcastable("\x1b[200~pasted\x1b]osc\x1b[201~")).toBe(false);
    });

    it("blocks report hidden after paste marker in same chunk", () => {
      expect(isBroadcastable("\x1b[200~pasted\x1b[201~\x1b[10;20R")).toBe(
        false,
      );
    });

    it("blocks empty input", () => {
      expect(isBroadcastable("")).toBe(false);
    });

    it("blocks standalone ESC at end", () => {
      expect(isBroadcastable("hello\x1b")).toBe(false);
    });

    it("blocks other control characters", () => {
      expect(isBroadcastable("\x0e\x1b")).toBe(false); // trailing ESC
      expect(isBroadcastable("text\x1b\x00text")).toBe(false); // ESC followed by null
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

    it("preserves allowed escape sequences", () => {
      const input = new TextEncoder().encode("\x1b[A");
      const filtered = filterTerminalReports(input);
      expect(new TextDecoder().decode(filtered)).toBe("\x1b[A");
    });

    it("removes disallowed sequences", () => {
      const input = new TextEncoder().encode("\x1b[?62c");
      const filtered = filterTerminalReports(input);
      expect(filtered.length).toBe(0);
    });

    it("handles both string and Uint8Array", () => {
      const str = "hello";
      const bytes = new TextEncoder().encode(str);

      expect(isBroadcastable(str)).toBe(true);
      expect(filterTerminalReports(bytes).length).toBe(bytes.length);
    });
  });
});

describe("allowlist edge cases", () => {
  it("broadcasts the Esc key on its own (vim)", () => {
    expect(isBroadcastable("\x1b")).toBe(true);
  });
  it("blocks a trailing ESC after other input (incomplete sequence)", () => {
    expect(isBroadcastable("a\x1b")).toBe(false);
  });
  it("broadcasts Ctrl-\\ ] ^ _ and Ctrl-@", () => {
    for (const c of ["\x1c", "\x1d", "\x1e", "\x1f", "\x00"])
      expect(isBroadcastable(c)).toBe(true);
  });
  it("blocks C1 controls such as 8-bit CSI", () => {
    expect(isBroadcastable("\u009b6n")).toBe(false);
    expect(isBroadcastable("\u0090q")).toBe(false);
  });
  it("still broadcasts non-ASCII text", () => {
    expect(isBroadcastable("héllo 🚀 ✓")).toBe(true);
  });
});

describe("strict input shapes", () => {
  it("blocks ESC string introducers and intermediates as Alt+key", () => {
    for (const c of ["P", "X", "^", "_", "\\", "]", "(", ")", "#", "%", " "])
      expect(isBroadcastable("\x1b" + c)).toBe(false);
  });
  it("broadcasts Alt+letter, Alt+digit and Alt+dot", () => {
    for (const c of ["b", "f", "c", "1", "."])
      expect(isBroadcastable("\x1b" + c)).toBe(true);
  });
  it("drops invalid UTF-8 instead of forwarding unchecked bytes", () => {
    expect(filterTerminalReports(new Uint8Array([0x61, 0xc3]))).toHaveLength(0);
    expect(
      filterTerminalReports(new Uint8Array([0xc2, 0x9b, 0x36, 0x6e])),
    ).toHaveLength(0);
  });
});
