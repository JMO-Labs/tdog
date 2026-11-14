import type { PetView } from "./petEngine";
import { type Cell, LYING, type Rows, SPR, face, spr } from "./petSprites";

export interface Scene {
  cells: Cell[];
  mini: "face" | "sleep";
  caption: string;
  /** Mini-egg eyes. */
  eyes: string;
  mouth: boolean;
}

const sprite = (k: string): Rows => SPR[k] as Rows;
const clampX = (x: number) => Math.max(0, Math.min(18, x));
/** Ping-pong walk across 0..18, one step every 3 ticks; no randomness so frames stay pure. */
const wander = (t: number) => {
  const p = Math.floor(t / 3) % 36;
  return p <= 18 ? p : 36 - p;
};

/** One frame for a live pet. `t` is the animation tick (0 when reduced motion). */
export function petScene(v: PetView, tick: number, reduced: boolean): Scene {
  const t = reduced ? 0 : tick;
  const a = (t % 2) as 0 | 1;
  const at = reduced ? 0 : v.actT;
  const x = 10;
  const y = 9;
  const cells: Cell[] = [];
  if (v.night) cells.push(...spr(sprite("moon"), 1, 1));
  for (let i = 0; i < v.poops; i++) {
    cells.push(...spr(sprite("poop"), 26 - i * 6, 19));
    if (a) cells.push(...spr(sprite("stink"), 26 - i * 6, 16));
  }
  const out = (me: Cell[], caption: string, eyes: string, mouth = false) => ({
    cells: cells.concat(me),
    mini: "face" as const,
    caption,
    eyes,
    mouth,
  });
  const up = (n: number) => (reduced ? 0 : n);
  switch (v.act) {
    case "eat": {
      const bite = Math.min(4, Math.floor(at / 3));
      const bone = (sprite("bone") as string[]).map((r) =>
        r.slice(0, 5 - bite).padEnd(5, "."),
      );
      cells.push(...spr(bone, x + 15, y + 8));
      return out(
        face(a ? "closed" : "open", { mouth: !a }, x, y),
        "Dogbert is eating.",
        "open",
        true,
      );
    }
    case "full":
      return out(
        face("closed", {}, x + (a ? 1 : -1), y),
        "Dogbert is full. No thanks.",
        "open",
      );
    case "play": {
      const bx = 30 - ((at * 2) % 34);
      const by = 12 + Math.abs(((at * 3) % 8) - 4);
      cells.push(...spr(sprite("ball"), bx, by));
      return out(
        face("happy", { legs: a, mouth: true, tail: a ? 2 : 1 }, clampX(bx - 6), y - up(a)),
        "Dogbert is playing fetch.",
        "happy",
      );
    }
    case "clean": {
      const sweep = 31 - at * 4;
      for (let yy = 0; yy < 24; yy++) cells.push([sweep, yy]);
      cells.push(...spr(sprite("spark"), x - 4, y - 3));
      return out(face("happy", {}, x, y), "All clean.", "happy");
    }
    case "startle":
      cells.push(...spr(sprite("bang"), x + 15, y - 2));
      return out(
        face("shock", { mouth: true }, x, y - (at < 2 ? up(2) : 0)),
        "Dogbert jumped. Something went wrong.",
        "shock",
      );
    case "celebrate":
      cells.push(
        ...spr(sprite("heart"), x - 6, y - 6 - (t % 4)),
        ...spr(sprite("heart"), x + 15, y - 4 - ((t + 2) % 4)),
      );
      return out(
        face("happy", { mouth: true, tail: a ? 2 : 1 }, x, y - up(a * 2)),
        "Dogbert is celebrating. Tests passed.",
        "happy",
      );
    case "yawn":
      return out(
        face("closed", { mouth: true }, x, y),
        "Dogbert yawns.",
        "closed",
        true,
      );
    case "stretch":
      cells.push(...spr(sprite("sun"), 1, 1));
      return out(
        face(at < 4 ? "closed" : "happy", { mouth: at < 4, legs: 1 }, x, y),
        "Good morning. Dogbert is stretching.",
        at < 4 ? "closed" : "happy",
      );
    case "grumpy":
      return out(
        face("sad", {}, x, y),
        "Dogbert woke up. It is the middle of the night.",
        "sad",
      );
  }
  if (v.asleep) {
    cells.push(
      ...spr(LYING, 10, 15),
      ...spr(sprite("z"), 25, 9 - ((t >> 1) % 4)),
    );
    return {
      cells,
      mini: "sleep",
      eyes: "closed",
      mouth: false,
      caption: v.night
        ? "Dogbert is asleep. It is night."
        : "Dogbert is asleep. Shells are quiet.",
    };
  }
  if (v.happy === 0) {
    cells.push(
      ...spr(sprite("cloud"), x + 3, 1),
      ...spr(sprite("rain"), x + 3, 3 + a),
    );
    return out(
      face("", { nose: false }, x, y),
      "Dogbert is sulking. Try playing fetch.",
      "sad",
    );
  }
  if (v.typing)
    return out(
      face("up", { tail: a ? 2 : 1 }, x, y),
      "Dogbert is watching you type.",
      "open",
    );
  if (v.reading)
    return out(
      face(t % 4 < 2 ? "left" : "right", {}, x, y - (v.hop ? up(1) : 0)),
      "Dogbert is reading your output.",
      "open",
    );
  if (v.hunger === 0)
    return out(
      face("sad", {}, x, y),
      "Dogbert is hungry. Press A to feed.",
      "sad",
    );
  const px = reduced ? x : wander(t);
  const blink = t % 40 === 0;
  const eyes = blink ? "closed" : t % 24 < 6 ? (px < 18 ? "right" : "left") : "open";
  return out(
    face(eyes, { legs: a }, px, y),
    "Dogbert is wandering around.",
    "open",
  );
}
