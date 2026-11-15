import { expect, test, vi } from "vitest";
import { FONTS } from "./schema";
import { fontFamily, loadFont } from "./fonts";

test("every schema font id resolves to a family with a mono fallback", () => {
  for (const id of FONTS) expect(fontFamily(id)).toMatch(/monospace$/);
  expect(fontFamily("vt323")).toContain("VT323");
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
  expect(load).toHaveBeenCalledTimes(1);
  expect(load).toHaveBeenCalledWith('16px "VT323"');
});

test("loadFont resolves for every schema font id", async () => {
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    value: { load },
    configurable: true,
  });
  for (const id of FONTS) await expect(loadFont(id)).resolves.toBeUndefined();
  expect(load).toHaveBeenCalled();
});

test("loadFont swallows a font load failure and keeps the fallback", async () => {
  Object.defineProperty(document, "fonts", {
    value: { load: vi.fn().mockRejectedValue(new Error("boom")) },
    configurable: true,
  });
  await expect(loadFont("courier-prime")).resolves.toBeUndefined();
  await expect(loadFont("space-mono")).resolves.toBeUndefined();
});
