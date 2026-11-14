// Sign-on sequence: idle → dialing → verifying → connected → done.
export type Phase = "idle" | "dialing" | "verifying" | "connected" | "done";
export const initial: Phase = "idle";
export const STEPS = ["dialing", "verifying", "connected"] as const;

const ORDER: Phase[] = ["idle", "dialing", "verifying", "connected", "done"];
export const next = (p: Phase): Phase =>
  ORDER[Math.min(ORDER.indexOf(p) + 1, ORDER.length - 1)];

export const label = (p: (typeof STEPS)[number]): string =>
  ({
    dialing: "Dialing…",
    verifying: "Verifying password…",
    connected: "Connected!",
  })[p];

/** Whether step `s` is lit at phase `p`. */
export const lit = (p: Phase, s: Phase): boolean =>
  ORDER.indexOf(p) >= ORDER.indexOf(s);

/** Mutable so tests can zero the delays. */
export const timing = { step: 650, reducedStep: 150, hold: 1400, nono: 2400 };
