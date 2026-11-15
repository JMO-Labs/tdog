import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  document.head.querySelectorAll("link").forEach((l) => l.remove());
  vi.resetModules();
});

const links = () =>
  document.head.querySelectorAll<HTMLLinkElement>(
    'link[href="/api/fonts.css"]',
  );

test("loadServerFonts injects the stylesheet once and resolves on load", async () => {
  const { loadServerFonts } = await import("./serverFonts");
  const a = loadServerFonts();
  const b = loadServerFonts();
  expect(links()).toHaveLength(1);
  expect(links()[0].rel).toBe("stylesheet");
  links()[0].dispatchEvent(new Event("load"));
  await expect(Promise.all([a, b])).resolves.toBeDefined();
});

test("a failing stylesheet still resolves so the fallback font stays", async () => {
  const { loadServerFonts } = await import("./serverFonts");
  const p = loadServerFonts();
  links()[0].dispatchEvent(new Event("error"));
  await expect(p).resolves.toBeUndefined();
});

test("whenFamilyReady waits for the stylesheet, then the face", async () => {
  const load = vi.fn().mockResolvedValue([]);
  Object.defineProperty(document, "fonts", {
    value: { load },
    configurable: true,
  });
  const { whenFamilyReady } = await import("./serverFonts");
  const p = whenFamilyReady('"Fira Code", monospace');
  expect(load).not.toHaveBeenCalled();
  links()[0].dispatchEvent(new Event("load"));
  await p;
  expect(load).toHaveBeenCalledWith('16px "Fira Code", monospace');
});
