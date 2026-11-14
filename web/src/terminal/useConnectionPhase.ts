import { useCallback, useEffect, useReducer, useRef } from "react";
import { INITIAL, step, type Phase } from "./connection";
import type { SessionState } from "./session";

export const STATIC_MS = 400;
/** Replay is over once output has been quiet this long. */
export const QUIET_MS = 400;
/** Never rewind longer than this, however chatty the replay. */
export const MAX_REWIND_MS = 3000;

/**
 * Drives the gag phases from session state. `noteOutput` marks scrollback
 * arriving; `onRewound` fires once when a reconnect finishes replaying.
 */
export function useConnectionPhase(
  state: SessionState,
  onRewound: () => void,
): { phase: Phase; noteOutput: () => void } {
  const [s, dispatch] = useReducer(step, INITIAL);
  const cb = useRef(onRewound);
  cb.current = onRewound;
  const quiet = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const exited = state.status === "closed" && state.exitCode !== undefined;
  useEffect(() => {
    dispatch({ t: "status", status: state.status, exited });
  }, [state.status, exited]);

  useEffect(() => {
    if (s.phase !== "static") return;
    const id = setTimeout(() => dispatch({ t: "staticDone" }), STATIC_MS);
    return () => clearTimeout(id);
  }, [s.phase]);

  const finish = useCallback(() => {
    clearTimeout(quiet.current);
    dispatch({ t: "replayDone" });
  }, []);
  const prev = useRef<Phase>("live");
  useEffect(() => {
    if (s.phase === "rewinding") {
      quiet.current = setTimeout(finish, QUIET_MS);
      const cap = setTimeout(finish, MAX_REWIND_MS);
      return () => clearTimeout(cap);
    }
    if (prev.current === "rewinding" && s.phase === "live") cb.current();
    return undefined;
  }, [s.phase, finish]);
  useEffect(() => {
    prev.current = s.phase;
  }, [s.phase]);

  const noteOutput = useCallback(() => {
    if (prev.current !== "rewinding") return;
    clearTimeout(quiet.current);
    quiet.current = setTimeout(finish, QUIET_MS);
  }, [finish]);

  return { phase: s.phase, noteOutput };
}
