import { useCallback } from "react";
import { usePref } from "../settings/prefs";

export type Variants = { fun: string; plain: string };

/** Words banned from plain copy (lowercase substrings). */
export const SLANG_WORDS = [
  "radical",
  "bodacious",
  "booyah",
  "bummer",
  "da bomb",
  "phat",
  "whoa",
  "duuude",
  "rewind",
  "nuke",
  "bag of chips",
  "as if",
];

/** Single source of user-facing playful copy. `{n}` style vars are filled by `text`. */
export const COPY = {
  "auth.signedIn": {
    fun: "Signed in. Your shells are right where you left them.",
    plain: "Signed in.",
  },
  "auth.wrongPassword": {
    fun: "Wrong password. Give it another go.",
    plain: "Wrong password.",
  },
  "auth.created": {
    fun: "Account created. You're in.",
    plain: "Account created.",
  },
  "session.ended": {
    fun: "Session ended. See you next time.",
    plain: "Signed out.",
  },
  "session.endedHead": { fun: "Be kind, rewind.", plain: "Signed out." },
  "kill.titleAll": { fun: "Kill all shells?", plain: "Kill all shells?" },
  "kill.body": {
    fun: "{what} will die. SIGHUP first, SIGKILL after 3 s.",
    plain: "{what} will be terminated. SIGHUP first, SIGKILL after 3 s.",
  },
  "kill.hold": { fun: "Hold to nuke", plain: "Hold to confirm" },
  "kill.done": { fun: "Killed {n} shells.", plain: "Killed {n} shells." },
  "kill.done1": { fun: "Killed 1 shell.", plain: "Killed 1 shell." },
  "conn.tracking": {
    fun: "Adjusting tracking…",
    plain: "Connection lost. Reconnecting…",
  },
  "conn.rewinding": { fun: "Rewinding…", plain: "Restoring session…" },
  "conn.back": {
    fun: "Reconnected. Scrollback replayed.",
    plain: "Reconnected.",
  },
} satisfies Record<string, Variants>;

export type CopyKey = keyof typeof COPY;

export function text(
  key: CopyKey,
  serious: boolean,
  vars: Record<string, string | number> = {},
): string {
  const v = COPY[key][serious ? "plain" : "fun"];
  return v.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** Copy lookup bound to the serious preference. */
export function useCopy() {
  const [serious] = usePref("serious");
  return useCallback(
    (key: CopyKey, vars?: Record<string, string | number>) =>
      text(key, serious, vars),
    [serious],
  );
}
