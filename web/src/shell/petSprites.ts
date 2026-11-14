// Dogbert sprite data from docs/design/mockup-pet.js. '#' = lit LCD segment.
export type Cell = [number, number];
export type Rows = readonly string[];

/** Front view, 14x11, no eyes or mouth; beagle ears hang beside the head. */
export const FACE: Rows = [
  "...########...",
  "..#........#..",
  ".##........##.",
  "#.#........#.#",
  "#.#........#.#",
  "#.#........#.#",
  ".##........##.",
  "..#........#..",
  "...########...",
  "...#......#...",
  "...#......#...",
];
export const LEGS: readonly (readonly [string, string])[] = [
  ["...#.#..#.#...", "...##....##..."],
  ["...#.#..#.#...", "....##..##...."],
];
export const EYES: Record<string, readonly Cell[]> = {
  open: [
    [4, 4],
    [4, 5],
    [9, 4],
    [9, 5],
  ],
  left: [
    [3, 4],
    [3, 5],
    [8, 4],
    [8, 5],
  ],
  right: [
    [5, 4],
    [5, 5],
    [10, 4],
    [10, 5],
  ],
  up: [
    [4, 4],
    [9, 4],
  ],
  closed: [
    [3, 5],
    [4, 5],
    [9, 5],
    [10, 5],
  ],
  happy: [
    [3, 5],
    [4, 4],
    [5, 5],
    [8, 5],
    [9, 4],
    [10, 5],
  ],
  shock: [
    [3, 4],
    [4, 4],
    [3, 5],
    [4, 5],
    [9, 4],
    [10, 4],
    [9, 5],
    [10, 5],
  ],
  sad: [
    [3, 4],
    [4, 5],
    [10, 4],
    [9, 5],
  ],
};
export const LYING: Rows = [
  "..##......##..",
  ".#..######..#.",
  "#............#",
  "#..##....##..#",
  "#.....##.....#",
  ".#..........#.",
  "..##########..",
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

/** Dogbert's front view: body, legs, nose, eyes, optional mouth and tail. */
export function face(
  eyes: string,
  { legs = 0, mouth = false, tail = 0, nose = true }: FaceOpts = {},
  ox = 0,
  oy = 0,
): Cell[] {
  const rows = [...FACE, ...LEGS[legs]];
  if (nose) rows[6] = ".##...##...##.";
  const c = spr(rows, ox, oy);
  for (const [x, y] of EYES[eyes] ?? []) c.push([ox + x, oy + y]);
  if (mouth) c.push([ox + 6, oy + 7], [ox + 7, oy + 7]);
  if (tail) c.push([ox + 11, oy + 10], [ox + 12, oy + (tail === 1 ? 9 : 11)]);
  return c;
}
