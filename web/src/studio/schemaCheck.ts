import type { TerminalPreset } from "./terminalToml";

type Node = Record<string, unknown>;
export type Schema = Node;

/** Follows "#/$defs/x" refs and dotted property paths ("font.size"). */
export function propOf(schema: Schema, path: string): Node | undefined {
  const deref = (n: Node | undefined): Node | undefined => {
    const ref = n?.$ref;
    if (typeof ref !== "string") return n;
    return (schema.$defs as Record<string, Node> | undefined)?.[
      ref.replace("#/$defs/", "")
    ];
  };
  let n: Node | undefined = schema;
  for (const k of path.split(".")) {
    n = deref((deref(n)?.properties as Record<string, Node> | undefined)?.[k]);
  }
  return n;
}

export const enumOf = (schema: Schema | null, path: string): string[] =>
  (schema && (propOf(schema, path)?.enum as string[] | undefined)) || [];

const NUMBERS: [string, string][] = [
  ["font.size", "Font size"],
  ["background.opacity", "Opacity"],
  ["background.blur", "Blur"],
];

/** Field-level errors for values the terminal schema rules out. */
export function checkTerminal(
  schema: Schema | null,
  p: TerminalPreset,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!schema) return errs;
  const get = (path: string) =>
    path.split(".").reduce<unknown>((o, k) => (o as Node | undefined)?.[k], p);
  for (const [path] of NUMBERS) {
    const v = get(path);
    const n = propOf(schema, path);
    if (typeof v !== "number" || !n) continue;
    if (Number.isNaN(v)) errs[path] = "Must be a number";
    else if (typeof n.minimum === "number" && v < n.minimum)
      errs[path] = `Must be at least ${n.minimum}`;
    else if (typeof n.maximum === "number" && v > n.maximum)
      errs[path] = `Must be at most ${n.maximum}`;
  }
  for (const path of ["target", "background.kind"]) {
    const v = get(path);
    const allowed = enumOf(schema, path);
    if (typeof v === "string" && v && allowed.length && !allowed.includes(v))
      errs[path] = `Must be one of ${allowed.join(", ")}`;
  }
  return errs;
}

/** Splits the server's "path: message" into a field path and message. */
export function splitError(msg: string): { path: string; message: string } {
  const m = /^([A-Za-z_][\w.]*(?:\[\d+\])?(?:\.\w+)*): (.+)$/s.exec(msg);
  return m ? { path: m[1], message: m[2] } : { path: "", message: msg };
}
