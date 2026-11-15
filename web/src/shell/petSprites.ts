// Dogbert sprite data from docs/design/mockup-pet.js. '#' = lit LCD segment.
export type Cell = [number, number];
export type Rows = readonly string[];

/** Solid side view facing right, 14x10 (square LCD pixels): pointed ears,
 * head with snout, body. Eyes are cut out; nose, tongue and tail are added. */
export const FACE: Rows = [
  "........#...#.",
  "........##.##.",
  "........#####.",
  "........#####.",
  "........######",
  "........####..",
  ".##########...",
  ".##########...",
  "..########....",
  "..##....##....",
];
export const LEGS: readonly (readonly [string, string])[] = [
  ["..##....##....", "..##....##...."],
  ["..##....##....", ".##....##....."],
];
/** Eye cells, unlit against the solid head (cols 9-11, rows 2-3). */
export const EYES: Record<string, readonly Cell[]> = {
  open: [[10, 3]],
  left: [[9, 3]],
  right: [[11, 3]],
  up: [[10, 2]],
  closed: [
    [9, 3],
    [10, 3],
  ],
  happy: [
    [9, 3],
    [10, 2],
    [11, 3],
  ],
  shock: [
    [10, 2],
    [11, 2],
    [10, 3],
    [11, 3],
  ],
  sad: [
    [9, 2],
    [10, 3],
  ],
};
/** Lying side view, 14x6: head up at the right (closed eye cut out), tail at the left. */
export const LYING: Rows = [
  "..........#..#",
  "..........####",
  "..........#..#",
  "#.........####",
  ".############.",
  "..###########.",
];
export const SPR: Record<string, Rows> = {
  bone: ["#...#", ".###.", "#...#"],
  ball: [".#.", "#.#", ".#."],
  poop: ["..#..", ".###.", "#####"],
  heart: [".#.#.", "#####", ".###.", "..#.."],
  bang: ["#", "#", "#", ".", "#"],
  z: ["####", "..#.", ".#..", "####"],
  sun: ["#.#.#", ".###.", "#####", ".###.", "#.#.#"],
  moon: [".##.", "#...", "#...", ".##."],
  spark: ["#.#", ".#.", "#.#"],
  cloud: [".##.##.", "#######"],
  rain: ["#.#.#..", ".#.#.#."],
  stink: [".#.#.", "#.#.."],
};

export interface FaceOpts {
  legs?: 0 | 1;
  mouth?: boolean;
  /** 0 none, 1 up, 2 down */
  tail?: 0 | 1 | 2;
  nose?: boolean;
  /** Theme costume rows, anchored to the top of the head. */
  costume?: Rows;
}

export const COSTUME_MAX_W = 14;
export const COSTUME_MAX_H = 6;

/** Costume pixels: 1..6 rows, each 1..14 of '#' and '.'. */
export function validCostumeRows(rows: unknown): rows is string[] {
  return (
    Array.isArray(rows) &&
    rows.length >= 1 &&
    rows.length <= COSTUME_MAX_H &&
    rows.every(
      (r) =>
        typeof r === "string" &&
        r.length >= 1 &&
        r.length <= COSTUME_MAX_W &&
        /^[#.]+$/.test(r),
    )
  );
}

/** Costume lit cells: sits on top of the head (cols headX..headX+headW-1),
 * its bottom row just above the sprite's top row, kept inside the 14 cols. */
export function costumeCells(
  rows: Rows,
  ox: number,
  oy: number,
  headX = 8,
  headW = 6,
): Cell[] {
  const w = Math.max(...rows.map((r) => r.length));
  const x = Math.min(
    Math.max(headX + ((headW - w) >> 1), 0),
    COSTUME_MAX_W - w,
  );
  return spr(rows, ox + x, oy - rows.length);
}

/** Lying pose, optionally dressed. */
export function lying(ox: number, oy: number, costume?: Rows): Cell[] {
  const c = spr(LYING, ox, oy);
  if (costume) c.push(...costumeCells(costume, ox, oy, 10, 4));
  return c;
}

/** Lit cells of a sprite placed at (ox, oy). */
export function spr(rows: Rows, ox: number, oy: number): Cell[] {
  const out: Cell[] = [];
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      if (c === "#") out.push([ox + x, oy + y]);
    }),
  );
  return out;
}

/** Dogbert's side view: solid body, eye cut out, optional nose tip, tongue and wagging tail. */
export function face(
  eyes: string,
  { legs = 0, mouth = false, tail = 0, nose = true, costume }: FaceOpts = {},
  ox = 0,
  oy = 0,
): Cell[] {
  const off = new Set(
    (EYES[eyes] ?? []).map(([x, y]) => `${ox + x},${oy + y}`),
  );
  const c = spr([...FACE, ...LEGS[legs]], ox, oy).filter(
    ([x, y]) => !off.has(`${x},${y}`),
  );
  const add = (...p: Cell[]) =>
    c.push(...p.map(([x, y]): Cell => [ox + x, oy + y]));
  if (nose) add([13, 3]);
  if (mouth) add([12, 5], [12, 6]);
  add([0, 6]);
  if (tail === 1) add([0, 5], [0, 4]);
  if (tail === 2) add([0, 7], [0, 8]);
  if (costume) c.push(...costumeCells(costume, ox, oy));
  return c;
}
