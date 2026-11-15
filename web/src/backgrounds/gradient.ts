/** Gradient builder: 2-4 hex stops + angle → the backend-allowlisted format. */
export interface Stop {
  color: string;
  pos: number;
}
export interface GradientSpec {
  angle: number;
  stops: Stop[];
}

export const MIN_STOPS = 2;
export const MAX_STOPS = 4;
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export function buildGradient({ angle, stops }: GradientSpec): string {
  const list = stops
    .slice(0, MAX_STOPS)
    .map((s) => ({
      color: HEX.test(s.color) ? s.color : "#000000",
      pos: Math.round(clamp(s.pos, 0, 100)),
    }))
    .sort((a, b) => a.pos - b.pos);
  while (list.length < MIN_STOPS)
    list.push({ color: list[0]?.color ?? "#000000", pos: 100 });
  const deg = ((Math.round(angle) % 360) + 360) % 360;
  return `linear-gradient(${deg}deg, ${list.map((s) => `${s.color} ${s.pos}%`).join(", ")})`;
}

const PARSE = /^linear-gradient\((\d+)deg, (.+)\)$/;
const STOP = /^(#[0-9a-fA-F]{3,8}) (\d+)%$/;

/** Inverse of buildGradient; null for anything else (e.g. radial). */
export function parseGradient(css: string): GradientSpec | null {
  const m = PARSE.exec(css);
  if (!m) return null;
  const stops: Stop[] = [];
  for (const part of m[2].split(", ")) {
    const s = STOP.exec(part);
    if (!s) return null;
    stops.push({ color: s[1], pos: Number(s[2]) });
  }
  return stops.length >= MIN_STOPS && stops.length <= MAX_STOPS
    ? { angle: Number(m[1]), stops }
    : null;
}
