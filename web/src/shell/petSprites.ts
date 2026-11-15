// Dogbert sprite data from docs/design/mockup-pet.js. '#' = lit LCD segment.
export type Cell = [number, number];
export type Rows = readonly string[];

/** Side view facing right, 14x11: pointed ears, outlined head, solid body. */
export const FACE: Rows = [
  "......#..#....",
  "......##.##...",
  "......#####...",
  "......#...##..",
  "......#....#..",
  "......######..",
  "..#########...",
  ".###########..",
  "..##########..",
  "..##....##....",
  "..##....##....",
];
export const LEGS: readonly (readonly [string, string])[] = [
  ["..##....##....", "..##....##...."],
  ["..##....##....", ".##....##....."],
];
/** One visible eye, inside the head (cols 6-10, rows 3-4). */
export const EYES: Record<string, readonly Cell[]> = {
  open: [
    [8, 3],
    [8, 4],
  ],
  left: [
    [7, 3],
    [7, 4],
  ],
  right: [
    [9, 3],
    [9, 4],
  ],
  up: [[8, 3]],
  closed: [
    [7, 4],
    [8, 4],
  ],
  happy: [
    [7, 4],
    [8, 3],
    [9, 4],
  ],
  shock: [
    [7, 3],
    [8, 3],
    [7, 4],
    [8, 4],
  ],
  sad: [
    [7, 3],
    [8, 4],
  ],
};
/** Lying side view, 14x7: head up at the right, paws forward, tail at the left. */
export const LYING: Rows = [
  ".........#..#.",
  ".........#####",
  ".........#.#.#",
  "..#####..#####",
  ".###########..",
  "#############.",
  "..############",
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

/** Costume lit cells for a pet whose sprite origin is (ox, oy): centred over the 14-wide head, top row on the head's top row. */
export function costumeCells(rows: Rows, ox: number, oy: number): Cell[] {
  const w = Math.max(...rows.map((r) => r.length));
  return spr(rows, ox + ((COSTUME_MAX_W - w) >> 1), oy);
}

/** Lying pose, optionally dressed. */
export function lying(ox: number, oy: number, costume?: Rows): Cell[] {
  const c = spr(LYING, ox, oy);
  if (costume) c.push(...costumeCells(costume, ox, oy));
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

/** Dogbert's side view: body, legs, one eye, optional nose, mouth and wagging tail. */
export function face(
  eyes: string,
  { legs = 0, mouth = false, tail = 0, nose = true, costume }: FaceOpts = {},
  ox = 0,
  oy = 0,
): Cell[] {
  const c = spr([...FACE, ...LEGS[legs]], ox, oy);
  const add = (...p: Cell[]) =>
    c.push(...p.map(([x, y]): Cell => [ox + x, oy + y]));
  if (!tail) add([0, 7]);
  if (nose) add([12, 3], [13, 3], [12, 4], [13, 4]);
  for (const [x, y] of EYES[eyes] ?? []) add([x, y]);
  if (mouth) add([11, 6], [11, 7]);
  if (tail === 1) add([1, 6], [0, 5], [0, 4]);
  if (tail === 2) add([0, 8], [0, 9]);
  if (costume) c.push(...costumeCells(costume, ox, oy));
  return c;
}
