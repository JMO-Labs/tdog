import { afterEach, expect, test, vi } from "vitest";
import { json } from "../auth/testutil";
import {
  PresetError,
  listPresets,
  putScenePreset,
  resolvePreset,
  startScene,
} from "./api";

afterEach(() => vi.unstubAllGlobals());
const stub = (r: Response) => {
  const f = vi.fn(async () => r.clone());
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
