import { apiFetch, apiPost, apiPut } from "../auth/api";

export type Source = "upload" | "nerd" | "google";
export type Installed = { family: string; source: Source; styles: string[] };
export type CatalogFont = { name: string; source: "nerd" | "google" };

const NERD = [
  "0xProto",
  "AnonymousPro",
  "CascadiaCode",
  "CascadiaMono",
  "CodeNewRoman",
  "Cousine",
  "DejaVuSansMono",
  "FantasqueSansMono",
  "FiraCode",
  "FiraMono",
  "Hack",
  "Hasklig",
  "Inconsolata",
  "IntelOneMono",
  "Iosevka",
  "JetBrainsMono",
  "Meslo",
  "Monofur",
  "Monoid",
  "Mononoki",
  "RobotoMono",
  "SourceCodePro",
  "SpaceMono",
  "UbuntuMono",
  "VictorMono",
];
const GOOGLE = [
  "Anonymous Pro",
  "Cousine",
  "DM Mono",
  "Fira Code",
  "Fira Mono",
  "Fragment Mono",
  "IBM Plex Mono",
  "Inconsolata",
  "JetBrains Mono",
  "Red Hat Mono",
  "Roboto Mono",
  "Share Tech Mono",
  "Source Code Pro",
  "Space Mono",
  "Ubuntu Mono",
  "Victor Mono",
];
const CATALOG: CatalogFont[] = [
  ...NERD.map((name) => ({ name, source: "nerd" as const })),
  ...GOOGLE.map((name) => ({ name, source: "google" as const })),
];

/** Case-insensitive substring search, optionally limited to one source. */
export function searchCatalog(
  query: string,
  source?: "nerd" | "google",
): CatalogFont[] {
  const q = query.trim().toLowerCase();
  return CATALOG.filter(
    (f) => (!source || f.source === source) && f.name.toLowerCase().includes(q),
  );
}

async function check(r: Response, fallback: string): Promise<void> {
  if (r.ok) return;
  let msg = "";
  try {
    const t = (await r.text()).trim();
    try {
      msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t;
    }
  } catch {
    /* unreadable body */
  }
  throw new Error(msg || `${fallback} (${r.status})`);
}

export async function listFonts(): Promise<Installed[]> {
  const r = await apiFetch("/api/fonts");
  await check(r, "Could not load fonts");
  return ((await r.json()) as Installed[] | null) ?? [];
}

export async function installFont(
  source: "nerd" | "google",
  name: string,
): Promise<void> {
  await check(
    await apiPost(`/api/fonts/${source}`, { name }),
    "Install failed",
  );
}

export async function uploadFont(file: File): Promise<void> {
  const body = new FormData();
  body.append("file", file);
  await check(await apiPost("/api/fonts", body), "Upload failed");
}

export async function listTerminalPresets(): Promise<string[]> {
  const r = await apiFetch("/api/presets/terminal");
  await check(r, "Could not load presets");
  return ((await r.json()) as string[] | null) ?? [];
}

export type FontPatch = { family?: string; ligatures?: boolean };

const q = (s: string) => JSON.stringify(s);
const pairs = (p: FontPatch): [string, string][] => [
  ...(p.family !== undefined
    ? [["family", q(p.family)] as [string, string]]
    : []),
  ...(p.ligatures !== undefined
    ? [["ligatures", String(p.ligatures)] as [string, string]]
    : []),
];

/** Set font keys in a terminal preset's TOML (inline, table, or absent). */
export function withFont(toml: string, patch: FontPatch): string {
  const set = pairs(patch);
  const inline = /^font\s*=\s*\{([^}]*)\}[ \t]*$/m.exec(toml);
  if (inline) {
    const kv = new Map<string, string>(
      inline[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const i = s.indexOf("=");
          return [s.slice(0, i).trim(), s.slice(i + 1).trim()] as [
            string,
            string,
          ];
        }),
    );
    for (const [k, v] of set) kv.set(k, v);
    const body = [...kv].map(([k, v]) => `${k} = ${v}`).join(", ");
    return toml.replace(inline[0], `font = { ${body} }`);
  }
  const lines = toml.split("\n");
  const start = lines.findIndex((l) => l.trim() === "[font]");
  if (start >= 0) {
    let end = lines.findIndex((l, i) => i > start && l.trim().startsWith("["));
    if (end < 0) end = lines.length;
    for (const [k, v] of set) {
      const at = lines.findIndex(
        (l, i) =>
          i > start && i < end && new RegExp(`^${k}\\s*=`).test(l.trim()),
      );
      if (at >= 0) lines[at] = `${k} = ${v}`;
      else {
        let ins = end;
        while (ins > start + 1 && lines[ins - 1].trim() === "") ins--;
        lines.splice(ins, 0, `${k} = ${v}`);
        end++;
      }
    }
    return lines.join("\n");
  }
  const base = toml.endsWith("\n") || toml === "" ? toml : toml + "\n";
  return `${base}\n[font]\n${set.map(([k, v]) => `${k} = ${v}\n`).join("")}`;
}

/** Apply a font change to a terminal preset ("default" is created if absent). */
export async function applyFontToPreset(
  name: string,
  patch: FontPatch,
): Promise<void> {
  const path = `/api/presets/terminal/${encodeURIComponent(name)}`;
  const r = await apiFetch(path);
  let cur = "";
  if (r.ok) cur = await r.text();
  else if (r.status !== 404) await check(r, "Could not read preset");
  await check(
    await apiPut(path, withFont(cur, patch)),
    "Could not save preset",
  );
}
