import type { Effect } from "../theme/schema";
import { resolveEffects } from "./resolve";
import { usePref } from "../settings/prefs";
import { useFx, usePageVisible, useReducedMotionPref } from "./store";

/** Effects to draw now: theme × settings × reduced motion × visibility. */
export function useActiveEffects(
  effects: readonly Effect[],
  force = false,
): Effect[] {
  const settings = useFx();
  const reduced = useReducedMotionPref();
  const visible = usePageVisible();
  const [perf] = usePref("perf");
  if (perf && !force) return [];
  return force
    ? [...effects]
    : resolveEffects(effects, settings, reduced, visible);
}
