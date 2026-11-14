import { describe, expect, test } from "vitest";
import { EYES, FACE, LEGS, LYING, SPR, face, spr } from "./petSprites";

const has = (cells: number[][], x: number, y: number) =>
  cells.some(([cx, cy]) => cx === x && cy === y);

describe("sprite data", () => {
  test("face is 14 wide; legs match", () => {
    for (const r of FACE) expect(r).toHaveLength(14);
    for (const l of LEGS.flat()) expect(l).toHaveLength(14);
    for (const r of LYING) expect(r).toHaveLength(14);
    expect(Object.keys(SPR)).toContain("bone");
    expect(Object.keys(EYES)).toContain("happy");
  });
  test("spr offsets lit segments", () => {
    expect(spr(SPR.ball, 2, 3)).toEqual([
      [3, 3],
      [2, 4],
      [4, 4],
      [3, 5],
    ]);
  });
});

describe("face composition", () => {
  test("open eyes add four segments", () => {
    const base = face("none");
    const open = face("open");
    expect(open.length - base.length).toBe(4);
    expect(has(open, 4, 4) && has(open, 9, 5)).toBe(true);
  });
  test("mouth adds two segments at row 7", () => {
    const d = face("open", { mouth: true }).length - face("open").length;
    expect(d).toBe(2);
    expect(has(face("open", { mouth: true }), 6, 7)).toBe(true);
  });
  test("tail adds two segments, position by variant", () => {
    expect(has(face("open", { tail: 1 }), 12, 9)).toBe(true);
    expect(has(face("open", { tail: 2 }), 12, 11)).toBe(true);
    expect(face("open", { tail: 1 }).length).toBe(face("open").length + 2);
  });
  test("legs alternate frames", () => {
    expect(face("open", { legs: 0 })).not.toEqual(face("open", { legs: 1 }));
  });
  test("offset moves the whole sprite", () => {
    const a = face("open"),
      b = face("open", {}, 5, 2);
    expect(b[0]).toEqual([a[0][0] + 5, a[0][1] + 2]);
  });
  test("nose can be dropped", () => {
    expect(face("open", { nose: false })).not.toEqual(face("open"));
  });
});
