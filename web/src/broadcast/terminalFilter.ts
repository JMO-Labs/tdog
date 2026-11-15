/**
 * Filter terminal report sequences from broadcast using an allowlist tokenizer.
 * The xterm emulator generates responses for queries (cursor position, device attributes, etc.)
 * and terminal events (focus in/out, mouse reports). These must NOT be broadcast, as they could
 * be exploited to inject terminal control sequences into other panes.
 *
 * Only user input (typing, navigation, paste) is broadcast. Uses an allowlist: every token
 * in the chunk must be allowed. Disallows partial/incomplete sequences.
 */

/**
 * Check if input is entirely composed of allowed user input tokens.
 * Returns false if any token is disallowed (including terminal reports, partial sequences).
 */
export function isBroadcastable(str: string): boolean {
  if (str.length === 0) return false;

  let i = 0;
  while (i < str.length) {
    const ch = str.charCodeAt(i);

    // Printable ASCII (0x20-0x7E excluding 0x7F)
    if (ch >= 0x20 && ch <= 0x7e && ch !== 0x7f) {
      i++;
      continue;
    }

    // DEL, backspace, tab, newline, carriage return
    if (
      ch === 0x7f ||
      ch === 0x08 ||
      ch === 0x09 ||
      ch === 0x0a ||
      ch === 0x0d
    ) {
      i++;
      continue;
    }

    // Ctrl-A through Ctrl-Z (user modifiers)
    if (ch >= 0x01 && ch <= 0x1a) {
      i++;
      continue;
    }

    // ESC - start of escape sequence or standalone ESC
    if (ch === 0x1b) {
      const next = str.charCodeAt(i + 1);

      // Standalone ESC at end of string - incomplete, don't broadcast
      if (i + 1 >= str.length) return false;

      // ESC [ 2 0 0 ~ - Start of bracketed paste (check BEFORE general CSI)
      if (str.slice(i, i + 6) === "\x1b[200~") {
        // Find end marker
        const endIdx = str.indexOf("\x1b[201~", i + 6);
        if (endIdx === -1) return false; // Incomplete paste
        const pasteContent = str.slice(i + 6, endIdx);
        // Paste content must not contain ESC (would hide malicious sequences)
        if (pasteContent.includes("\x1b")) return false;
        i = endIdx + 6; // Skip to end of paste
        continue;
      }

      // ESC[ - CSI sequence
      if (next === 0x5b) {
        const match = str.slice(i).match(/^\x1b\[([0-9;]*)([@-~])/);
        if (!match) return false; // Incomplete CSI
        const [fullSeq, params, finalByte] = match;
        const final = finalByte.charCodeAt(0);

        // Allowed CSI: cursor keys A-D, home/end H/F, function keys 1~-24~, shift-tab Z, with ;modifiers
        const isFunctionKey = (p: string) => {
          // Match 1~-24~ optionally with ;modifiers
          if (final === 0x7e) {
            // ~ (function key)
            return /^([12]?[0-9])(;[0-9])?$/.test(p);
          }
          return false;
        };
        if (
          (final >= 0x41 && final <= 0x44) || // A-D (up/down/left/right)
          final === 0x48 || // H (home)
          final === 0x46 || // F (end)
          final === 0x5a || // Z (shift-tab)
          isFunctionKey(params)
        ) {
          i += fullSeq.length;
          continue;
        }
        return false; // Other CSI sequences not allowed (reports, mouse, etc.)
      }

      // ESC O - SS3 (alternate cursor key form)
      if (next === 0x4f) {
        if (i + 2 >= str.length) return false; // Incomplete
        const third = str.charCodeAt(i + 2);
        // Allowed: A-D, H, F, P-S
        if (
          (third >= 0x41 && third <= 0x44) ||
          third === 0x48 ||
          third === 0x46 ||
          (third >= 0x50 && third <= 0x53)
        ) {
          i += 3;
          continue;
        }
        return false;
      }

      // ESC followed by printable char (Alt+key)
      // But not: ESC] (OSC), ESC P (DCS), ESC _ (APC), ESC { (APC alt), ESC ~ (user-defined)
      if (
        next >= 0x20 &&
        next <= 0x7e &&
        next !== 0x5d && // ] - OSC
        next !== 0x50 && // P - DCS
        next !== 0x5f && // _ - APC
        next !== 0x7b && // { - APC alternative
        next !== 0x7e && // ~ - private use
        next !== 0x7f // DEL
      ) {
        i += 2;
        continue;
      }

      // All other ESC sequences (OSC, DCS, APC, other CSI, etc.) - not allowed
      return false;
    }

    // UTF-8 multi-byte sequences (high bit set)
    if (ch >= 0x80) {
      i++;
      continue;
    }

    // Other control characters - not broadcast
    return false;
  }

  return true;
}

/**
 * Filter out terminal report sequences, keeping only user input.
 * Uses an allowlist tokenizer: broadcasts only if every token is allowed.
 * Returns the input if broadcastable, or empty bytes otherwise.
 */
export function filterTerminalReports(data: Uint8Array): Uint8Array {
  const str = new TextDecoder().decode(data);
  return isBroadcastable(str) ? data : new Uint8Array(0);
}
