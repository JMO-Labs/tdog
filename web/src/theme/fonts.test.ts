import { expect, test, vi } from "vitest";
import { FONTS } from "./schema";
import { fontFamily, loadFont } from "./fonts";

test("every schema font id resolves to a family with a mono fallback", () => {
  for (const id of FONTS) expect(fontFamily(id)).toMatch(/monospace$/);
  expect(fontFamily("vt323")).toContain("VT323");
  for (const id of FONTS)
    expect(fontFamily(id)).toMatch(/", "Nerd Symbols", monospace$/);
  expect(fontFamily("press-start-2p")).toContain("Press Start 2P");
});

test("unknown id falls back to the default font", () => {
  expect(fontFamily("nope")).toBe(fontFamily("jetbrains-mono"));
});

test("loadFont loads once per id and waits for the face", async () => {
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    value: { load },
    configurable: true,
  });
  await loadFont("vt323");
  await loadFont("vt323");
  expect(load).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenCalledWith('16px "VT323"');
  expect(load).toHaveBeenCalledWith('16px "Nerd Symbols"', "\ue0b0");
});

const stubFonts = (load: unknown) =>
  Object.defineProperty(document, "fonts", {
    value: { load },
    configurable: true,
  });

test("loadFont requests every schema font family", async () => {
  vi.resetModules();
  const { loadFont: fresh } = await import("./fonts");
  const load = vi.fn().mockResolvedValue([]);
  stubFonts(load);
  for (const id of FONTS) await expect(fresh(id)).resolves.toBeUndefined();
  expect(load).toHaveBeenCalledTimes(FONTS.length * 2);
  for (const id of FONTS) {
    const family = fontFamily(id).split('"')[1];
    expect(load).toHaveBeenCalledWith(`16px "${family}"`);
  }
});

test("loadFont swallows a font load failure and keeps the fallback", async () => {
  vi.resetModules();
  const { loadFont: fresh } = await import("./fonts");
  const load = vi.fn().mockRejectedValue(new Error("boom"));
  stubFonts(load);
  await expect(fresh("courier-prime")).resolves.toBeUndefined();
  expect(load).toHaveBeenCalledWith('16px "Courier Prime"');
});

test("scaledSize normalises small faces and leaves the default alone", async () => {
  const { scaledSize, fontScale } = await import("./fonts");
  expect(fontScale("jetbrains-mono")).toBe(1);
  expect(fontScale("nope")).toBe(1);
  expect(scaledSize("jetbrains-mono")).toBe(15);
  expect(scaledSize("share-tech-mono", 14)).toBe(15);
  expect(scaledSize("courier-prime", 20)).toBe(22);
});
