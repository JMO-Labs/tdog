import { describe, expect, it } from "vitest";
import { buildFixture, SECTIONS } from "./fixture";

const text = new TextDecoder().decode(buildFixture());

describe("fixture", () => {
  it("covers every section", () => {
    expect(SECTIONS).toEqual(["colors", "nerdfont", "ligatures", "htop"]);
  });
  it("contains 256-colour and truecolor SGR sequences", () => {
    expect(text).toContain("\x1b[38;5;196m");
    expect(text).toMatch(/\x1b\[48;2;\d+;\d+;\d+m/);
  });
  it("contains Nerd Font private-use glyphs", () => {
    expect(text).toContain(""); // powerline arrow
    expect(text).toContain(""); // github
  });
  it("contains ligature samples", () => {
    for (const l of ["=>", "!==", "->", "<=>", "|>"]) expect(text).toContain(l);
  });
  it("contains htop-style cursor-addressed redraws", () => {
    expect(text).toContain("\x1b[H");
    expect((text.match(/\x1b\[\d+;1H/g) ?? []).length).toBeGreaterThan(100);
  });
  it("is deterministic and reasonably large", () => {
    expect(buildFixture()).toEqual(buildFixture());
    expect(buildFixture().length).toBeGreaterThan(100_000);
  });
});
