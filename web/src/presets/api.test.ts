import { afterEach, expect, test, vi } from "vitest";
import { json } from "../auth/testutil";
import {
  PresetError,
  deletePreset,
  getPresetToml,
  getSchema,
  listPresets,
  putPresetToml,
  resolveDraft,
  putScenePreset,
  resolvePreset,
  resolveScene,
  startScene,
} from "./api";

afterEach(() => vi.unstubAllGlobals());
const stub = (r: Response) => {
  const f = vi.fn(async (..._a: unknown[]) => r.clone());
  vi.stubGlobal("fetch", f);
  return f;
};

test("listPresets returns names", async () => {
  const f = stub(json(["a", "b"]));
  expect(await listPresets("terminal")).toEqual(["a", "b"]);
  expect(f.mock.calls[0][0]).toBe("/api/presets/terminal");
});

test("null list is empty", async () => {
  stub(json(null));
  expect(await listPresets("scene")).toEqual([]);
});

test("JSON error body becomes the message", async () => {
  stub(json({ error: "font.size: must be positive" }, 400));
  await expect(resolvePreset("x")).rejects.toThrow(
    new PresetError("font.size: must be positive"),
  );
});

test("plain-text error body becomes the message", async () => {
  stub(new Response("panes[1]: bad cwd\n", { status: 400 }));
  await expect(startScene("dev")).rejects.toThrow("panes[1]: bad cwd");
});

test("empty error body falls back to the status", async () => {
  stub(new Response("", { status: 500 }));
  await expect(listPresets("scene")).rejects.toThrow("500");
});

test("putScenePreset PUTs the toml", async () => {
  const f = stub(new Response(null, { status: 204 }));
  await putScenePreset("dev", 'name = "dev"');
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/presets/scene/dev");
  expect(init.method).toBe("PUT");
  expect(init.body).toBe('name = "dev"');
});

test("resolveScene queries by scene name", async () => {
  const body = { theme: { value: "dark", origin: "scene" } };
  const f = stub(json(body));
  expect(await resolveScene("dev&x")).toEqual(body);
  expect(f.mock.calls[0][0]).toBe("/api/presets/resolve?scene=dev%26x");
});

test("resolveScene surfaces server errors", async () => {
  stub(json({ error: "scene not found" }, 404));
  await expect(resolveScene("nope")).rejects.toThrow("scene not found");
});

test("getPresetToml returns the raw text", async () => {
  const f = stub(new Response('name = "a"\n'));
  expect(await getPresetToml("terminal", "a b")).toBe('name = "a"\n');
  expect(f.mock.calls[0][0]).toBe("/api/presets/terminal/a%20b");
});

test("putPresetToml PUTs and surfaces validation errors", async () => {
  const f = stub(new Response(null, { status: 204 }));
  await putPresetToml("terminal", "a", "x");
  expect((f.mock.calls[0][1] as RequestInit).method).toBe("PUT");
  stub(json({ error: "font.size: must be 6-72" }, 400));
  await expect(putPresetToml("terminal", "a", "x")).rejects.toThrow(
    "font.size: must be 6-72",
  );
});

test("deletePreset sends DELETE", async () => {
  const f = stub(new Response(null, { status: 204 }));
  await deletePreset("terminal", "a");
  expect(f.mock.calls[0][0]).toBe("/api/presets/terminal/a");
  expect((f.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
});

test("resolveDraft POSTs the toml as the pane layer", async () => {
  const body = { theme: { value: "x", origin: "global" } };
  const f = stub(json(body));
  expect(await resolveDraft("name = 1")).toEqual(body);
  expect(f.mock.calls[0][0]).toBe("/api/presets/resolve");
  expect((f.mock.calls[0][1] as RequestInit).method).toBe("POST");
});

test("getSchema returns parsed JSON", async () => {
  stub(json({ title: "t" }));
  expect(await getSchema("terminal")).toEqual({ title: "t" });
});
