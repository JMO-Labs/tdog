/**
 * Plugin ↔ host messages (ADR-0005). Everything from a plugin is untrusted:
 * `parsePluginMessage` accepts only plain data of a known shape, within limits.
 */

export const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_TEXT = 500;
const MAX_NODES = 100;

/** Declarative overlay UI: tdog renders it; text is never treated as HTML. */
export type OverlayNode =
  | { kind: "text"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "button"; id: string; text: string; danger?: boolean }
  | { kind: "input"; id: string; label: string };

export type PluginToHost =
  | { type: "ready" }
  | {
      type: "verdict";
      id: number;
      verdict: "allow" | "confirm";
      reason: string;
    }
  | { type: "screen"; id: number }
  | { type: "overlay"; nodes: OverlayNode[] }
  | { type: "dismiss" }
  | { type: "insert"; text: string }
  | { type: "error"; error: string };

export type HostToPlugin =
  | { type: "gate"; id: number; line: string }
  | { type: "line"; line: string }
  | { type: "screen"; id: number; lines: string[] }
  | { type: "action"; id: string; value?: string };

/** Plain JSON-like data only: no Map/Set/Date/typed arrays/functions/cycles. */
export function isPlain(v: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (v === null) return true;
  const t = typeof v;
  if (t === "string" || t === "boolean") return true;
  if (t === "number") return Number.isFinite(v);
  if (t !== "object") return false;
  if (Array.isArray(v)) return v.every((x) => isPlain(x, depth + 1));
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(v as object).every((x) => isPlain(x, depth + 1));
}

const str = (v: unknown, max = MAX_TEXT): v is string =>
  typeof v === "string" && v.length <= max;
const keys = (o: object, allowed: string[]) =>
  Object.keys(o).every((k) => allowed.includes(k));

function node(n: unknown): n is OverlayNode {
  if (!n || typeof n !== "object") return false;
  const o = n as Record<string, unknown>;
  switch (o.kind) {
    case "text":
    case "heading":
      return keys(o, ["kind", "text"]) && str(o.text);
    case "list":
      return (
        keys(o, ["kind", "items"]) &&
        Array.isArray(o.items) &&
        o.items.length <= 50 &&
        o.items.every((i) => str(i))
      );
    case "button":
      return (
        keys(o, ["kind", "id", "text", "danger"]) &&
        str(o.id, 40) &&
        str(o.text, 60) &&
        (o.danger === undefined || typeof o.danger === "boolean")
      );
    case "input":
      return (
        keys(o, ["kind", "id", "label"]) && str(o.id, 40) && str(o.label, 80)
      );
    default:
      return false;
  }
}

/** Validate a raw message from a plugin; null if it is not exactly allowed. */
export function parsePluginMessage(raw: unknown): PluginToHost | null {
  if (!isPlain(raw) || !raw || typeof raw !== "object" || Array.isArray(raw))
    return null;
  if (JSON.stringify(raw).length > MAX_MESSAGE_BYTES) return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case "ready":
    case "dismiss":
      return keys(m, ["type"]) ? (m as PluginToHost) : null;
    case "verdict":
      return keys(m, ["type", "id", "verdict", "reason"]) &&
        Number.isInteger(m.id) &&
        (m.verdict === "allow" || m.verdict === "confirm") &&
        str(m.reason ?? "", 200)
        ? {
            type: "verdict",
            id: m.id as number,
            verdict: m.verdict,
            reason: (m.reason as string | undefined) ?? "",
          }
        : null;
    case "screen":
      return keys(m, ["type", "id"]) && Number.isInteger(m.id)
        ? { type: "screen", id: m.id as number }
        : null;
    case "overlay":
      return keys(m, ["type", "nodes"]) &&
        Array.isArray(m.nodes) &&
        m.nodes.length <= MAX_NODES &&
        m.nodes.every(node)
        ? { type: "overlay", nodes: m.nodes as OverlayNode[] }
        : null;
    case "insert":
      return keys(m, ["type", "text"]) && str(m.text, 4096)
        ? { type: "insert", text: m.text as string }
        : null;
    case "error":
      return keys(m, ["type", "error"]) && str(m.error)
        ? { type: "error", error: m.error as string }
        : null;
    default:
      return null;
  }
}
