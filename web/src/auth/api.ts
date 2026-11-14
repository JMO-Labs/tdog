export interface Status {
  setup: boolean;
  authenticated: boolean;
}

export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      kind:
        | "token"
        | "password"
        | "totp"
        | "code"
        | "short"
        | "limited"
        | "setup"
        | "done"
        | "other";
      retryAfter?: number;
    };

export async function getStatus(): Promise<Status> {
  const r = await fetch("/api/status", { credentials: "same-origin" });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return (await r.json()) as Status;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

/** fetch for authenticated API calls: any 401 sends the user back to login. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const r = await fetch(path, { credentials: "same-origin", ...init });
  if (r.status === 401) onUnauthorized?.();
  return r;
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function login(
  password: string,
  code?: string,
): Promise<AuthResult> {
  const r = await post("/api/login", code ? { password, code } : { password });
  if (r.ok) return { ok: true };
  if (r.status === 401) {
    if (r.headers.get("X-TOTP-Required") === "1")
      return { ok: false, kind: "totp" };
    return { ok: false, kind: code ? "code" : "password" };
  }
  if (r.status === 409) return { ok: false, kind: "setup" };
  if (r.status === 429) {
    const n = Number(r.headers.get("Retry-After"));
    return { ok: false, kind: "limited", retryAfter: n > 0 ? n : 1 };
  }
  return { ok: false, kind: "other" };
}

export async function setup(
  token: string,
  password: string,
): Promise<AuthResult> {
  const r = await post("/api/setup", { token, password });
  if (r.ok) return { ok: true };
  if (r.status === 403) return { ok: false, kind: "token" };
  if (r.status === 400) return { ok: false, kind: "short" };
  if (r.status === 409) return { ok: false, kind: "done" };
  return { ok: false, kind: "other" };
}

export async function logout(): Promise<void> {
  await post("/api/logout", {}).catch(() => {});
}
