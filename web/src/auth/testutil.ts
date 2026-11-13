import { vi } from "vitest";

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** Mock fetch keyed by "METHOD /path"; a value may be a Response or a factory. */
export function mockFetch(routes: Record<string, Response | (() => Response)>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const h = routes[key];
    if (!h) throw new Error(`unmocked ${key}`);
    return typeof h === "function" ? h() : h.clone();
  });
}
