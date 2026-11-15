import { useEffect, useState } from "react";
import { apiFetch } from "../auth/api";

/** Container shell basename from the server; "shell" if unknown. */
export async function fetchShellName(): Promise<string> {
  try {
    const r = await apiFetch("/api/shell");
    if (!r.ok) return "shell";
    const j = (await r.json()) as { shell?: string };
    return j.shell || "shell";
  } catch {
    return "shell";
  }
}

export function useShellName(): string {
  const [name, setName] = useState("shell");
  useEffect(() => {
    let live = true;
    void fetchShellName().then((n) => live && setName(n));
    return () => {
      live = false;
    };
  }, []);
  return name;
}
