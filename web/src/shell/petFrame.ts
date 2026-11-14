import type { PetView } from "./petEngine";
import { petScene } from "./petScene";
import { type Cell, LYING, SPR, face, spr } from "./petSprites";

export interface FrameInput {
  awake: boolean;
  /** Animation counter, one step per ~250ms. */
  tick: number;
  reduced: boolean;
  /** Live pet state; without it the frame only follows `awake`. */
  view?: PetView;
}
/** What to draw: lit cells on the 32x24 LCD, the mini-egg pose and the caption. */
export interface Frame {
  pose: "awake" | "sleep";
  cells: Cell[];
  mini: "face" | "sleep";
  caption: string;
  /** Mini-egg expression. */
  eyes?: string;
  mouth?: boolean;
}

export const LCD_W = 32;
export const LCD_H = 24;

/** Pure description of one frame; no game logic. Reduced motion pins `tick` to 0. */
export function petFrame({ awake, tick, reduced, view }: FrameInput): Frame {
  if (view) {
    const s = petScene(view, tick, reduced);
    return { pose: s.mini === "sleep" ? "sleep" : "awake", ...s };
  }
  const t = reduced ? 0 : tick;
  const a = (t % 2) as 0 | 1;
  if (!awake) {
    return {
      pose: "sleep",
      cells: [...spr(LYING, 10, 15), ...spr(SPR.z, 25, 9 - ((t >> 1) % 4))],
      mini: "sleep",
      caption: "Dogbert is asleep. Shells are quiet.",
    };
  }
  const eyes = reduced ? "open" : t % 4 < 2 ? "left" : "right";
  return {
    pose: "awake",
    cells: face(eyes, { legs: a }, 10, 9),
    mini: "face",
    caption: "Dogbert is reading your output.",
  };
}

/** Mini egg (14x13 at 2x): the whole face, no tail. */
export function miniCells(
  mini: Frame["mini"],
  eyes = "open",
  mouth = false,
): Cell[] {
  return mini === "sleep"
    ? spr(LYING, 0, 3)
    : face(eyes, { mouth }).filter(([x]) => x < 14);
}
