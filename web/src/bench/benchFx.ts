import { EFFECT_IDS } from "../effects/resolve";
import type { Effect } from "../theme/schema";

/** Bench-only effects list from `?fx=all|<id>`; themes ship none. */
export function benchEffects(search: string): Effect[] {
  const v = new URLSearchParams(search).get("fx");
  const ids = v === "all" ? EFFECT_IDS : EFFECT_IDS.filter((i) => i === v);
  return ids.map((id) => ({ id, intensity: 1 }));
}
