import { expect, test } from "vitest";
import {
  draftToToml,
  newDraft,
  parseDraft,
  resizeSlots,
  type Draft,
} from "./sceneModel";

const draft: Draft = {
  ...newDraft("dev"),
  autostart: true,
  template: "1+2",
  ratio: 0.6,
  gap: 8,
  opacity: 0.85,
  bg: "#223344",
  slots: [
    { preset: "app" },
    { preset: "logs", fontSize: 12 },
    { preset: "app" },
  ],
};

test("3-slot scene from two presets round-trips through TOML", () => {
  const toml = draftToToml(draft);
  expect(toml).toContain('name = "dev"');
  expect(toml).toContain("autostart = true");
  expect(toml).toContain("gap = 8");
  expect(toml).toContain("pane_opacity = 0.85");
  expect(toml).toContain('[background]\nkind = "color"\nref = "#223344"');
  expect(toml).toContain('preset = "logs"');
  expect(parseDraft(toml)).toEqual(draft);
});

test("single-slot and empty slots round-trip", () => {
  const d: Draft = {
    ...newDraft("x"),
    template: "single",
    slots: resizeSlots([], "single"),
  };
  expect(parseDraft(draftToToml(d))).toEqual(d);
});

test("layouts outside the snap set are rejected with a message", () => {
  const toml = [
    'name = "x"',
    "[layout]",
    'type = "split"',
    'dir = "col"',
    "ratio = 0.5",
    "[layout.a]",
    'type = "pane"',
    'pane = "a"',
    "[layout.b]",
    'type = "pane"',
    'pane = "b"',
  ].join("\n");
  expect(() => parseDraft(toml)).toThrow(/snap layout/);
});

test("bad syntax names the line", () => {
  expect(() => parseDraft("name = \n")).toThrow(/line 1/);
});
