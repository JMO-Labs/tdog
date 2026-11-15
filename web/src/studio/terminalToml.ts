export type HookMode = "all" | "stop_on_fail";
export type Hook = { mode: HookMode; run: string[] };
export type EnvRow = { key: string; value: string };
/** A terminal preset as the designer edits it (mirrors internal/config). */
export type TerminalPreset = {
  name?: string;
  target?: string;
  cwd?: string;
  env?: EnvRow[];
  persistent?: boolean;
  pre_exec?: Hook;
  command?: string;
  post_exec?: Hook;
  on_close?: Hook;
  theme?: string;
  font?: { family?: string; size?: number; ligatures?: boolean };
  background?: { kind?: string; ref?: string; opacity?: number; blur?: number };
};

const HOOKS = ["pre_exec", "post_exec", "on_close"] as const;
const TABLES = ["font", "background"] as const;
const q = (s: string) => JSON.stringify(s);
const BARE = /^[A-Za-z0-9_-]+$/;
const key = (k: string) => (BARE.test(k) ? k : q(k));

function scalar(out: string[], k: string, v: unknown) {
  if (v === undefined || v === "") return;
  out.push(`${k} = ${typeof v === "string" ? q(v) : String(v)}`);
}

/** Preset TOML: scalars first, then one table per group. Empty fields drop. */
export function serializeTerminal(p: TerminalPreset): string {
  const out: string[] = [];
  for (const k of ["name", "target", "cwd", "persistent", "command", "theme"])
    scalar(out, k, p[k as keyof TerminalPreset]);
  const tables: string[] = [];
  const env = (p.env ?? []).filter((r) => r.key);
  if (env.length) {
    tables.push("", "[env]");
    for (const r of env) tables.push(`${key(r.key)} = ${q(r.value)}`);
  }
  for (const h of HOOKS) {
    const v = p[h];
    const run = v?.run.filter(Boolean) ?? [];
    if (!v || !run.length) continue;
    tables.push("", `[${h}]`, `mode = ${q(v.mode)}`);
    tables.push(`run = [${run.map(q).join(", ")}]`);
  }
  for (const t of TABLES) {
    const body: string[] = [];
    for (const [k, v] of Object.entries(p[t] ?? {})) scalar(body, k, v);
    if (body.length) tables.push("", `[${t}]`, ...body);
  }
  return [...out, ...tables].join("\n").replace(/^\n/, "") + "\n";
}

function stripComment(line: string): string {
  let inS: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inS) {
      if (c === "\\" && inS === '"') i++;
      else if (c === inS) inS = null;
    } else if (c === '"' || c === "'") inS = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

function str(v: string): string | undefined {
  if (/^"(?:[^"\\]|\\.)*"$/.test(v)) return JSON.parse(v) as string;
  if (/^'[^']*'$/.test(v)) return v.slice(1, -1);
  return undefined;
}

function value(v: string): unknown {
  const s = str(v);
  if (s !== undefined) return s;
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    const items = v.slice(1, -1).match(/"(?:[^"\\]|\\.)*"|'[^']*'/g) ?? [];
    const rest = v.slice(1, -1).replace(/"(?:[^"\\]|\\.)*"|'[^']*'|[\s,]/g, "");
    if (!rest) return items.map((i) => str(i) as string);
  }
  throw new Error("unsupported value");
}

/** Parses the TOML subset the designer writes; throws "line N: ..." otherwise. */
export function parseTerminal(toml: string): TerminalPreset {
  const p: Record<string, unknown> = {};
  let table: string | null = null;
  const lines = toml.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = stripComment(raw).trim();
    if (!line) return;
    const fail = (m: string): never => {
      throw new Error(`line ${i + 1}: ${m}`);
    };
    const h = /^\[([A-Za-z_]+)\]$/.exec(line);
    if (h) {
      table = h[1];
      if (table === "env") p.env = [];
      else p[table] = {};
      return;
    }
    const m = /^("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(
      line,
    );
    if (!m) return fail("unsupported syntax");
    const k = str(m[1]) ?? m[1];
    let v: unknown;
    try {
      v = value(m[2].trim());
    } catch {
      return fail("unsupported value");
    }
    if (table === "env") {
      if (typeof v !== "string") return fail("env values must be strings");
      (p.env as EnvRow[]).push({ key: k, value: v });
    } else if (table) (p[table] as Record<string, unknown>)[k] = v;
    else if ((HOOKS as readonly string[]).includes(k) && typeof v === "string")
      p[k] = { mode: "all", run: [v] };
    else p[k] = v;
  });
  for (const k of HOOKS) {
    const v = p[k] as Partial<Hook> | undefined;
    if (v) p[k] = { mode: v.mode ?? "all", run: v.run ?? [] };
  }
  return p as TerminalPreset;
}
