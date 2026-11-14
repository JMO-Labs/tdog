/**
 * Connection-state gags (mockup: VHS tracking → static → rewind). Pure
 * transitions; timers live in useConnectionPhase.
 */
export type Phase = "live" | "tracking" | "static" | "rewinding";

export interface ConnState {
  phase: Phase;
  /** True from the first unexpected drop until the replay finishes. */
  dropped: boolean;
}

export type ConnEvent =
  | {
      t: "status";
      status: "connecting" | "open" | "closed";
      /** Closed because the shell exited (not a dropped socket). */
      exited?: boolean;
    }
  | { t: "staticDone" }
  | { t: "replayDone" };

export const INITIAL: ConnState = { phase: "live", dropped: false };

export function step(s: ConnState, e: ConnEvent): ConnState {
  switch (e.t) {
    case "status":
      if (e.status === "closed") {
        return e.exited ? INITIAL : { phase: "tracking", dropped: true };
      }
      if (e.status === "open" && s.dropped) {
        return { phase: "static", dropped: true };
      }
      return s;
    case "staticDone":
      return s.phase === "static" ? { phase: "rewinding", dropped: true } : s;
    case "replayDone":
      return s.phase === "rewinding" ? INITIAL : s;
  }
}
