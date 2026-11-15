/** Plugin API client: calls backend plugin endpoints. */

import { apiPost, apiFetch, apiDelete } from "../auth/api";

export interface PluginInfo {
  id: string;
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

/** Inspect a plugin from URL or file. Returns StagedManifest or error. */
export async function inspectPlugin(input: {
  url?: string;
  file?: File;
}): Promise<StagedManifest> {
  const r = input.url
    ? await apiPost("/api/plugins/inspect", { url: input.url })
    : await inspectFile(input.file!);

  if (!r.ok) {
    const msg = await r
      .json()
      .then((d: any) => d.error)
      .catch(() => "Unknown error");
    throw new Error(`Inspect failed: ${msg}`);
  }

  return r.json();
}

/** Inspect plugin from uploaded file. */
async function inspectFile(file: File): Promise<Response> {
  const form = new FormData();
  form.append("file", file);
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
      .then((d: any) => d.error)
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
    ai: "Send prompts to your AI provider for processing (rate-limited)",
  };

  // Check for net: permission
  if (perm.startsWith("net:")) {
    const host = perm.slice(4);
    return `Make requests to ${host}; cannot access local network`;
  }

  return descriptions[perm] || `Permission: ${perm}`;
}
