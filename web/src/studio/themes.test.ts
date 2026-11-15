import { expect, test } from "vitest";
import { THEMES } from "../theme/registry";
import { filterThemes, pickRandom, setThemeInToml } from "./themes";

test("filters by appearance and name", () => {
  const dark = filterThemes(THEMES, "", "dark");
  expect(dark.length).toBeGreaterThan(0);
  expect(dark.every((t) => t.appearance === "dark")).toBe(true);
  const light = filterThemes(THEMES, "", "light");
  expect(light.length).toBeGreaterThan(0);
  expect(light.length).toBeLessThanOrEqual(THEMES.length);
  expect(light.every((t) => t.appearance === "light" || t.light)).toBe(true);
  expect(filterThemes(THEMES, "", "all")).toHaveLength(THEMES.length);
  const hit = filterThemes(THEMES, "  ACK ", "all");
  expect(hit.map((t) => t.id)).toContain("ack-ack");
  expect(filterThemes(THEMES, "zzzzqq", "all")).toEqual([]);
});

test("pickRandom avoids the excluded id", () => {
  const list = THEMES.slice(0, 3);
  expect(pickRandom(list, list[0].id, () => 0)?.id).toBe(list[1].id);
  expect(pickRandom(list, null, () => 0.99)?.id).toBe(list[2].id);
  expect(pickRandom([], null, Math.random)).toBeUndefined();
  expect(pickRandom([list[0]], list[0].id, Math.random)?.id).toBe(list[0].id);
});

test("setThemeInToml replaces or adds a top-level theme key", () => {
  expect(setThemeInToml('name = "a"\ntheme = "x"\n', "y")).toBe(
    'name = "a"\ntheme = "y"\n',
  );
  expect(setThemeInToml('name = "a"\n[font]\nsize = 3\n', "y")).toBe(
    'name = "a"\ntheme = "y"\n[font]\nsize = 3\n',
  );
  expect(setThemeInToml("", "y")).toBe('theme = "y"\n');
  // a theme key inside a table is not the preset's theme
  expect(setThemeInToml('[x]\ntheme = "q"\n', "y")).toBe(
    'theme = "y"\n[x]\ntheme = "q"\n',
  );
});
