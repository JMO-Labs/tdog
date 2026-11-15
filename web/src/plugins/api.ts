/** Plugin API client: calls backend plugin endpoints. */

import { apiPost, apiFetch, apiDelete } from "../auth/api";

export interface PluginInfo {
  id: string;
  name: string;
  author: string;
  version: string;
  enabled: boolean;
  permissions: string[];
  sha256: string;
}

export interface Manifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  entry: string;
  permissions: string[];
  commands?: { id: string; title: string }[];
}

export interface StagedManifest {
  manifest: Manifest;
  sha256: string;
  token: string;
}

/** A plugin as its two files: the manifest and the entry script. */
export type PluginFiles = { manifest: Blob | string; entry: Blob | string };

/** Inspect a plugin from a URL or its files. Returns StagedManifest or error. */
export async function inspectPlugin(
  input: { url: string } | PluginFiles,
): Promise<StagedManifest> {
  const r =
    "url" in input
      ? await apiPost("/api/plugins/inspect", { url: input.url })
      : await inspectFiles(input);

  if (!r.ok) {
    const msg = await r
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => "Unknown error");
    throw new Error(`Inspect failed: ${msg}`);
  }

  return r.json();
}

/** The server wants `manifest` and `entry` parts. */
async function inspectFiles(f: PluginFiles): Promise<Response> {
  const blob = (v: Blob | string) =>
    typeof v === "string" ? new Blob([v]) : v;
  const form = new FormData();
  form.append("manifest", blob(f.manifest), "tdog-plugin.json");
  form.append("entry", blob(f.entry), "index.js");
  return apiPost("/api/plugins/inspect", form);
}

/** Install a staged plugin. */
export async function installPlugin(
  token: string,
  permissions: string[],
): Promise<void> {
  const r = await apiPost("/api/plugins/install", {
    token,
    grant: permissions,
  });
  if (!r.ok) {
    const msg = await r
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => "Unknown error");
    throw new Error(`Install failed: ${msg}`);
  }
}

/** Get list of installed plugins. */
export async function listPlugins(): Promise<PluginInfo[]> {
  const r = await apiFetch("/api/plugins");
  if (!r.ok) throw new Error("Failed to list plugins");
  return r.json();
}

/** Get entry.js source for a plugin. */
export async function getPluginEntry(id: string): Promise<string> {
  const r = await apiFetch(`/api/plugins/${id}/entry.js`);
  if (!r.ok) throw new Error(`Failed to fetch plugin entry: ${r.status}`);
  return r.text();
}

/** Enable/disable a plugin. */
export async function setPluginEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const r = await apiPost(`/api/plugins/${id}`, { enabled }, {});
  if (!r.ok) throw new Error("Failed to update plugin");
}

/** Delete a plugin. */
export async function deletePlugin(id: string): Promise<void> {
  const r = await apiDelete(`/api/plugins/${id}`);
  if (!r.ok) throw new Error("Failed to delete plugin");
}

/** Get plain-language description of a permission. */
export function permissionDescription(perm: string): string {
  const descriptions: Record<string, string> = {
    "screen:read": "Read visible lines from terminal; cannot modify",
    "input:observe":
      "See commands after you press Enter; cannot send or modify",
    "input:gate":
      "Ask you to confirm commands before they run; can never send commands",
    "input:insert":
      "Insert text at cursor from buttons you click; cannot type otherwise",
    overlay:
      "Show panels and messages in your terminal; renders only text, buttons, and lists",
    ai: "Send prompts to your AI provider through tdog (not available yet)",
  };

  // Check for net: permission
  if (perm.startsWith("net:")) {
    const host = perm.slice(4);
    return `Make requests to ${host}; cannot reach your local network (not available yet)`;
  }

  return descriptions[perm] || `Permission: ${perm}`;
}
