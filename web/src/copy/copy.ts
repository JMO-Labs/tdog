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

/** Toast headline pools (fun mode only; serious mode shows no headline). */
export const SLANG: Record<"success" | "fail" | "warn", string[]> = {
  success: [
    "Radical!",
    "Bodacious!",
    "Booyah!",
    "All that and a bag of chips",
    "Da bomb",
    "Phat!",
  ],
  fail: [
    "Bummer.",
    "As if!",
    "Not!",
    "Talk to the hand",
    "Psych!",
    "Whatever.",
  ],
  warn: ["Whoa.", "Duuude.", "Don't have a cow"],
};

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
  "scene.gone": {
    fun: "{name} is gone. All its shells were killed.",
    plain: "Closed {name}: all its shells were killed.",
  },
  "conn.tracking": {
    fun: "Adjusting tracking…",
    plain: "Connection lost. Reconnecting…",
  },
  "conn.rewinding": { fun: "Rewinding…", plain: "Restoring session…" },
  "conn.back": {
    fun: "Reconnected. Scrollback replayed.",
    plain: "Reconnected.",
  },
  "pet.asleep": {
    fun: "Dogbert is asleep. Shells are quiet.",
    plain: "Companion is idle.",
  },
  "pet.reading": {
    fun: "Dogbert is reading your output.",
    plain: "Companion is idle.",
  },
  "pet.eat": {
    fun: "Dogbert is eating.",
    plain: "Companion is eating.",
  },
  "pet.full": {
    fun: "Dogbert is full. No thanks.",
    plain: "Companion is full.",
  },
  "pet.play": {
    fun: "Dogbert is playing fetch.",
    plain: "Companion is playing.",
  },
  "pet.clean": {
    fun: "All clean.",
    plain: "Cleaned.",
  },
  "pet.startle": {
    fun: "Dogbert jumped. Something went wrong.",
    plain: "Companion was startled.",
  },
  "pet.celebrate": {
    fun: "Dogbert is celebrating. Tests passed.",
    plain: "Companion is happy.",
  },
  "pet.yawn": {
    fun: "Dogbert yawns.",
    plain: "Companion is tired.",
  },
  "pet.stretch": {
    fun: "Good morning. Dogbert is stretching.",
    plain: "Companion is awake.",
  },
  "pet.grumpy": {
    fun: "Dogbert woke up. It is the middle of the night.",
    plain: "Companion is awake. It is night.",
  },
  "pet.night": {
    fun: "Dogbert is asleep. It is night.",
    plain: "Companion is idle. It is night.",
  },
  "pet.sulk": {
    fun: "Dogbert is sulking. Try playing fetch.",
    plain: "Companion is unhappy. Try Play.",
  },
  "pet.typing": {
    fun: "Dogbert is watching you type.",
    plain: "Companion is idle.",
  },
  "pet.hungry": {
    fun: "Dogbert is hungry. Press A to feed.",
    plain: "Companion is hungry. Press A to feed.",
  },
  "pet.wander": {
    fun: "Dogbert is wandering around.",
    plain: "Companion is idle.",
  },
  "pet.name": { fun: "Dogbert", plain: "Companion" },
  "pet.open": { fun: "Open Dogbert", plain: "Open companion" },
  "pet.dressed": {
    fun: "Dogbert put on a {name}.",
    plain: "Companion is wearing a {name}.",
  },
  "pet.btnFeed": { fun: "Feed", plain: "Feed" },
  "pet.btnPlay": { fun: "Play fetch", plain: "Play" },
  "pet.btnClean": { fun: "Clean up", plain: "Clean up" },
  "empty.offline": { fun: "Nothing playing.", plain: "Disconnected." },
  "empty.offlineHint": {
    fun: "Reconnect, or press",
    plain: "Reconnect, or press",
  },
  "empty.offlineHint2": { fun: "for commands.", plain: "for commands." },
  "empty.noPanes": { fun: "No panes.", plain: "No panes." },
  "empty.noPanesHint": {
    fun: "Every shell is closed.",
    plain: "Every shell is closed.",
  },
  "empty.newPane": { fun: "New pane", plain: "New pane" },
  "empty.presets": {
    fun: "Or start from a preset:",
    plain: "Or start from a preset:",
  },
  "conn.reconnect": { fun: "Reconnect", plain: "Reconnect" },
  "conn.play": { fun: "▶ PLAY", plain: "Offline" },
  "conn.rew": { fun: "◀◀ REW", plain: "Offline" },
  "conn.slow": {
    fun: "Dial-up speeds. Typing may feel sluggish.",
    plain: "High latency. Typing may feel sluggish.",
  },
  "boot.post": {
    fun: "tdog bios 1.0\nmemory ........ ok\npty bus ....... ok\nsocket ........ ok\nstorage ....... ok\nstarting shell",
    plain: "tdog\nstarting shell",
  },
  "boot.rew": { fun: "◀◀ rew", plain: "Loading" },
  "boot.play": { fun: "▶ play", plain: "Starting" },
  "preset.none": {
    fun: "No {kind} presets yet.",
    plain: "No {kind} presets yet.",
  },
  "preset.attached": {
    fun: '"{name}" was already running. Attached.',
    plain: '"{name}" was already running. Attached.',
  },
  "preset.started": { fun: 'Started "{name}".', plain: 'Started "{name}".' },
  "preset.nothing": {
    fun: "Nothing to save: this scene has no panes.",
    plain: "Nothing to save: this scene has no panes.",
  },
  "preset.saved": {
    fun: 'Saved scene preset "{name}".',
    plain: 'Saved scene preset "{name}".',
  },
  "settings.signedOutAll": {
    fun: "Signed out everywhere.",
    plain: "Signed out everywhere.",
  },
  "auth.createdSignIn": {
    fun: "Account created. Sign in with your new password.",
    plain: "Account created. Sign in with your new password.",
  },
  "kill.titleScene": {
    fun: "Kill scene {scope}?",
    plain: "Kill scene {scope}?",
  },
  "tape.empty": {
    fun: "Tape empty. {min} characters minimum.",
    plain: "Password too short. {min} characters minimum.",
  },
  "tape.more": {
    fun: "{left} more characters to go.",
    plain: "{left} more characters needed.",
  },
  "tape.more1": {
    fun: "1 more character to go.",
    plain: "1 more character needed.",
  },
  "tape.ok": { fun: "Good enough to record.", plain: "Password accepted." },
  "tape.full": {
    fun: "Full tape. Totally tubular.",
    plain: "Strong password.",
  },
  "signon.denied": { fun: "Ah ah ah!", plain: "Access denied." },
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
