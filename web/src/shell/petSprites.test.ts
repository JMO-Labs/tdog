import { describe, expect, test } from "vitest";
import {
  EYES,
  FACE,
  LEGS,
  LYING,
  SPR,
  costumeCells,
  face,
  lying,
  spr,
  validCostumeRows,
} from "./petSprites";
import { miniCells } from "./petFrame";

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

describe("costume", () => {
  const HAT = ["..####..", ".######."];
  const lit = (c: number[][]) => c.map(([x, y]) => `${x},${y}`);
  test("centred on the head top, drawn with the pose", () => {
    const base = lit(face("open", {}, 10, 9));
    const dressed = lit(face("open", { costume: HAT }, 10, 9));
    const extra = dressed.filter((c) => !base.includes(c));
    expect(extra.length).toBeGreaterThan(0);
    // width 8 in 14 => offset 3; first lit cell of row 0 is col 2 => x 10+3+2
    expect(dressed).toContain("15,9");
    expect(dressed).toContain("14,10");
  });
  test("walking and front poses move the costume with the face", () => {
    for (const legs of [0, 1] as const) {
      const a = face("open", { legs, costume: HAT }, 0, 0);
      const b = face("open", { legs, costume: HAT }, 4, 2);
      expect(b.length).toBe(a.length);
      expect(b).toContainEqual([
        a[a.length - 1][0] + 4,
        a[a.length - 1][1] + 2,
      ]);
    }
  });
  test("lying pose carries the costume", () => {
    const d = lying(10, 15, HAT);
    expect(d.length).toBe(
      lying(10, 15).length + costumeCells(HAT, 10, 15).length,
    );
    expect(lit(d)).toContain("15,15");
  });
  test("mini egg composes costume for face and sleep, clipped to 14 cols", () => {
    for (const m of ["face", "sleep"] as const) {
      const c = miniCells(m, "open", false, ["#".repeat(14)]);
      expect(c.length).toBeGreaterThan(miniCells(m).length);
      expect(c.every(([x]) => x >= 0 && x < 14)).toBe(true);
    }
  });
  test("costume rows validate: max 14x6, '#' and '.' only", () => {
    expect(validCostumeRows(["#".repeat(14), "......"])).toBe(true);
    expect(validCostumeRows(Array(6).fill("#"))).toBe(true);
    expect(validCostumeRows(Array(7).fill("#"))).toBe(false);
    expect(validCostumeRows(["#".repeat(15)])).toBe(false);
    expect(validCostumeRows(["#x#"])).toBe(false);
    expect(validCostumeRows([])).toBe(false);
    expect(validCostumeRows("##")).toBe(false);
    expect(validCostumeRows([5])).toBe(false);
  });
});
