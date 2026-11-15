/**
 * Holds Enter while gate plugins look at the command (ADR-0005 input:gate).
 * The command text is read from the screen at the cursor, so history recall
 * (↑ Enter), edits and multi-line pastes are all covered; typed text that was
 * not echoed yet is checked too. Plugins can never send or change input.
 */
import type { GateResult } from "./PluginManager";

export interface GateDeps {
  hasGate(): boolean;
  gate(text: string): Promise<GateResult>;
  observe(line: string): void;
  /** Text of the cursor's line on screen (prompt included). */
  currentLine(): string;
  /** Ask the user; true = run it anyway. */
  confirm(plugin: string, reason: string): Promise<boolean>;
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const CLEAR_LINE = "\x15"; // Ctrl-U: readline/zle clear the line being edited

/** Index of the first Enter that is not inside a bracketed paste, or -1. */
export function enterIndex(s: string): number {
  let inPaste = false;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith(PASTE_START, i)) inPaste = true;
    else if (s.startsWith(PASTE_END, i)) inPaste = false;
    else if (s[i] === "\r" && !inPaste) return i;
  }
  return -1;
}

/** Printable text of a chunk: paste markers and escape sequences dropped. */
export function visible(s: string): string {
  return s
    .replaceAll(PASTE_START, "")
    .replaceAll(PASTE_END, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1bO.|\x1b./g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

/** Returns the input handler for one pane; `pass` sends to the shell. */
export function createInputGate(
  deps: GateDeps,
  pass: (s: string) => void,
): (data: string) => void {
  let holding = false;
  const queue: string[] = [];

  const release = () => {
    holding = false;
    const q = queue.splice(0);
    q.forEach(feed);
  };

  function feed(data: string): void {
    if (holding) {
      queue.push(data);
      return;
    }
    const i = enterIndex(data);
    if (i < 0) return pass(data);
    const before = data.slice(0, i);
    const after = data.slice(i + 1);
    const text = [deps.currentLine(), visible(before)]
      .filter(Boolean)
      .join("\n");
    if (!deps.hasGate()) {
      pass(before + "\r");
      deps.observe(text);
      return after ? feed(after) : undefined;
    }
    pass(before);
    holding = true;
    void deps
      .gate(text)
      .then(async (v) => {
        if (v.verdict !== "confirm") return true;
        return deps.confirm(v.plugin ?? "A plugin", v.reason);
      })
      .catch(() => true)
      .then((run) => {
        if (!run) {
          pass(CLEAR_LINE); // drop the command; the rest of this chunk too
          return release();
        }
        pass("\r");
        deps.observe(text);
        if (after) queue.unshift(after); // rest of the chunk, in order
        release();
      });
  }
  return feed;
}
