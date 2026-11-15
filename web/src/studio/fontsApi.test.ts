import { afterEach, expect, test, vi } from "vitest";
import {
  installFont,
  searchCatalog,
  uploadFont,
  readLigatures,
  withFont,
  applyFontToPreset,
} from "./fontsApi";

afterEach(() => vi.restoreAllMocks());

test("search matches name case-insensitively and filters by source", () => {
  const all = searchCatalog("");
  expect(all.some((f) => f.source === "nerd")).toBe(true);
  expect(all.some((f) => f.source === "google")).toBe(true);
  const r = searchCatalog("jetbrains");
  expect(r.length).toBeGreaterThan(0);
  expect(r.every((f) => /jetbrains/i.test(f.name))).toBe(true);
  expect(
    searchCatalog("jetbrains", "google").every((f) => f.source === "google"),
  ).toBe(true);
  expect(searchCatalog("zzzz-none")).toEqual([]);
});

function mockFetch(status: number, body = "") {
  const f = vi.fn(async () => new Response(body || null, { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

test("install posts the name and resolves on 204", async () => {
  const f = mockFetch(204);
  await installFont("nerd", "Hack");
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/fonts/nerd");
  expect(init.body).toBe(JSON.stringify({ name: "Hack" }));
});

test("install failure surfaces the server message", async () => {
  mockFetch(502, JSON.stringify({ error: "download failed" }));
  await expect(installFont("google", "Abc")).rejects.toThrow("download failed");
});

test("upload sends multipart file", async () => {
  const f = mockFetch(204);
  await uploadFont(new File(["x"], "Foo-Regular.ttf"));
  const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(init.body).toBeInstanceOf(FormData);
});

test("withFont edits inline, table and missing font tables", () => {
  expect(
    withFont('name = "a"\nfont = { size = 14 }\n', { family: "Hack" }),
  ).toContain('font = { size = 14, family = "Hack" }');
  expect(
    withFont('font = { family = "X", size = 14 }', {
      family: "Hack",
      ligatures: false,
    }),
  ).toBe('font = { family = "Hack", size = 14, ligatures = false }');
  const t = withFont(
    'name = "a"\n[font]\nfamily = "X"\n[background]\nkind = "k"\n',
    {
      ligatures: true,
    },
  );
  expect(t).toBe(
    'name = "a"\n[font]\nfamily = "X"\nligatures = true\n[background]\nkind = "k"\n',
  );
  expect(withFont('name = "a"\n', { family: "Hack" })).toBe(
    'name = "a"\n\n[font]\nfamily = "Hack"\n',
  );
});

test("applyFontToPreset reads, edits and puts the preset", async () => {
  const calls: [string, string?][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init?: RequestInit) => {
      calls.push([`${init?.method ?? "GET"} ${u}`, init?.body as string]);
      return init?.method === "PUT"
        ? new Response(null, { status: 204 })
        : new Response('name = "dev"\n');
    }),
  );
  await applyFontToPreset("dev", { family: "Hack" });
  expect(calls[1][0]).toBe("PUT /api/presets/terminal/dev");
  expect(calls[1][1]).toContain('family = "Hack"');
});

test("readLigatures reads inline, table, and defaults to on", () => {
  expect(readLigatures("font = { ligatures = false }\n")).toBe(false);
  expect(readLigatures("[font]\nligatures = false\n")).toBe(false);
  expect(readLigatures('[font]\nfamily = "x"\n')).toBe(true);
  expect(readLigatures("")).toBe(true);
});
