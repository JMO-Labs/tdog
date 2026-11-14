import { useEffect, useState } from "react";

// Sprite from docs/design/mockup.js (DOG / COL).
const DOG = [
  "....XX....XX",
  "...XYYX..XYX",
  "...XYYYXXYYX",
  "..XYYYYYYYYX",
  ".XYYKYYYYKYX",
  "XYYYYYPPYYYX",
  "XYYYYYYYYYX.",
  ".XXYYYYYYX..",
  "..XYXXXXYX..",
  "..XX....XX..",
];
const COL: Record<string, string> = {
  X: "#160B2E",
  Y: "#FFE14D",
  K: "#160B2E",
  P: "#FF2D95",
};
export const PET_IDLE_MS = 3000;

/** True while output arrived within the last PET_IDLE_MS. `stamp` is bumped on each output. */
export function usePetAwake(stamp: number): boolean {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!stamp) return;
    setAwake(true);
    const t = setTimeout(() => setAwake(false), PET_IDLE_MS);
    return () => clearTimeout(t);
  }, [stamp]);
  return awake;
}

export function Pet({ awake, onHide }: { awake: boolean; onHide: () => void }) {
  const tip = `Dogbert is ${awake ? "watching your output" : "asleep"}. Click to hide`;
  return (
    <button
      data-testid="pet"
      className={`pet ${awake ? "awake" : "sleep"}`}
      aria-label="Hide pet"
      title={tip}
      onClick={onHide}
    >
      <svg viewBox="-2 -8 44 40" aria-hidden="true">
        {DOG.flatMap((row, y) =>
          [...row].map((c, x) =>
            c === "." ? null : (
              <rect
                key={`${x},${y}`}
                x={x * 3}
                y={y * 3}
                width={3}
                height={3}
                fill={!awake && c === "K" ? "#4E4568" : COL[c]}
              />
            ),
          ),
        )}
        {!awake && (
          <>
            <text className="zz" x="34" y="0">
              z
            </text>
            <text className="zz" x="39" y="-5">
              z
            </text>
          </>
        )}
      </svg>
    </button>
  );
}
