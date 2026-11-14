// Dogbert behaviour engine: a pure state machine on injected time (Date.now).
// Ported from docs/design/mockup-pet.js; the React glue only reads view().
export type Act =
  | "eat"
  | "full"
  | "play"
  | "clean"
  | "startle"
  | "celebrate"
  | "yawn"
  | "stretch"
  | "grumpy";

export const SLEEP_MS = 5 * 60e3;
export const POOP_MS = 20 * 60e3;
export const HUNGER_MS = 45 * 60e3;
export const HAPPY_MS = 60 * 60e3;
export const YAWN_MS = 20e3;
export const STORE_KEY = "tdog.pet.stats";
const MAX = 4;
const ACT_MS: Record<Act, number> = {
  eat: 2000,
  full: 1200,
  play: 3200,
  clean: 1000,
  startle: 1500,
  celebrate: 2000,
  yawn: 1500,
  stretch: 2400,
  grumpy: 3000,
};

const BAD = /\x07|\b(error|failed|fatal|panic)\b/i;
const GOOD = /\b(passed|success|done)\b|✓/i;
// A BEL that ends an OSC sequence (window title) is not an alert.
const OSC = /\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g;

/** startle: BEL or error words; celebrate: pass words; startle wins. */
export function classify(text: string): "startle" | "celebrate" | null {
  const t = text.replace(OSC, "");
  if (BAD.test(t)) return "startle";
  return GOOD.test(t) ? "celebrate" : null;
}

export const isNight = (d: Date) => d.getHours() >= 22 || d.getHours() < 7;
const clamp = (n: number) => Math.max(0, Math.min(MAX, n));

export interface Saved {
  hunger: number;
  happy: number;
  poops: number;
  at: number;
}
export interface PetView {
  act: Act | null;
  /** Ticks (250ms) since the act began. */
  actT: number;
  night: boolean;
  asleep: boolean;
  hunger: number;
  happy: number;
  poops: number;
  typing: boolean;
  reading: boolean;
  hop: boolean;
  attention: boolean;
}
type Store = Pick<Storage, "getItem" | "setItem">;

function load(store: Store | null): Saved | null {
  try {
    const v = JSON.parse(store?.getItem(STORE_KEY) ?? "null");
    if (v && ["hunger", "happy", "poops", "at"].every((k) => isFinite(v[k])))
      return {
        hunger: clamp(v.hunger),
        happy: clamp(v.happy),
        poops: Math.max(0, Math.min(2, v.poops)),
        at: v.at,
      };
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return null;
}

/** Stats after `away` ms: hunger -1/45min, happy -1/60min (x2 with poop left). Floors at 0. */
export function drift(s: Saved, now: number): Saved {
  const away = Math.max(0, now - s.at);
  return {
    ...s,
    hunger: clamp(s.hunger - Math.floor(away / HUNGER_MS)),
    happy: clamp(s.happy - Math.floor((away * (s.poops ? 2 : 1)) / HAPPY_MS)),
    at: now,
  };
}

export class PetEngine {
  private hunger = 3;
  private happy = 3;
  private poops = 0;
  private act: Act | null = null;
  private actAt = 0;
  private lastOut: number;
  private lastKey = 0;
  private yawned = true;
  private night: boolean;
  private bursts = 0;
  private outSeen = 0;
  private outN = 0;
  private hopUntil = 0;
  private last: number;
  private poopAcc = 0;
  private hungerAcc = 0;
  private happyAcc = 0;

  constructor(private store: Store | null = safeStorage()) {
    const now = Date.now();
    this.last = now;
    this.lastOut = now;
    this.night = isNight(new Date(now));
    const saved = load(store);
    if (saved) {
      const d = drift(saved, now);
      ({ hunger: this.hunger, happy: this.happy, poops: this.poops } = d);
      // first wake after the night: stretch with a sun
      if (isNight(new Date(saved.at)) && !this.night)
        this.start("stretch", now);
    }
  }

  private start(a: Act, now: number) {
    this.act = a;
    this.actAt = now;
  }

  private save(now = Date.now()) {
    try {
      const s: Saved = {
        hunger: this.hunger,
        happy: this.happy,
        poops: this.poops,
        at: now,
      };
      this.store?.setItem(STORE_KEY, JSON.stringify(s));
    } catch {
      /* quota or blocked: pet still works */
    }
  }

  private asleep(now: number) {
    return this.night || now - Math.max(this.lastOut, this.lastKey) > SLEEP_MS;
  }

  /** Feed a chunk of terminal output from any pane. */
  output(text: string) {
    const now = Date.now();
    this.lastOut = now;
    this.outN++;
    const k = classify(text);
    if (k) this.start(k, now);
  }

  /** Any keystroke. */
  key() {
    const now = Date.now();
    if (this.night && !this.act) this.start("grumpy", now);
    this.lastKey = now;
    this.yawned = false;
  }

  press(b: "A" | "B" | "C") {
    const now = Date.now();
    if (b === "A") {
      if (this.hunger >= MAX) return this.start("full", now);
      this.start("eat", now);
      this.hunger = clamp(this.hunger + 1);
    } else if (b === "B") {
      this.start("play", now);
      this.happy = clamp(this.happy + 1);
    } else this.start("clean", now);
    this.save(now);
  }

  /** Advance the clock; call about every 250ms. */
  tick() {
    const now = Date.now();
    const dt = Math.max(0, now - this.last);
    this.last = now;
    const night = isNight(new Date(now));
    if (this.night && !night) this.start("stretch", now);
    this.night = night;
    if (this.act && now - this.actAt > ACT_MS[this.act]) this.act = null;
    if (this.act === "clean" && now - this.actAt >= ACT_MS.clean / 2)
      this.poops = 0;
    let dirty = false;
    if (this.outN !== this.outSeen) {
      // a burst: hop, a snack every ~8
      this.outSeen = this.outN;
      this.hopUntil = now + 300;
      if (++this.bursts % 8 === 0 && this.hunger < MAX) {
        this.hunger++;
        dirty = true;
      }
      if (night && !this.act) this.start("grumpy", now);
    }
    if (
      !this.yawned &&
      this.lastKey &&
      now - this.lastKey > YAWN_MS &&
      !this.act
    ) {
      this.yawned = true;
      this.start("yawn", now);
    }
    if (!this.asleep(now)) {
      this.poopAcc += dt;
      if (this.poopAcc >= POOP_MS) {
        this.poopAcc = 0;
        if (this.poops < 2) {
          this.poops++;
          dirty = true;
        }
      }
    }
    this.hungerAcc += dt;
    if (this.hungerAcc >= HUNGER_MS) {
      this.hungerAcc -= HUNGER_MS;
      this.hunger = clamp(this.hunger - 1);
      dirty = true;
    }
    this.happyAcc += dt * (this.poops ? 2 : 1);
    if (this.happyAcc >= HAPPY_MS) {
      this.happyAcc -= HAPPY_MS;
      this.happy = clamp(this.happy - 1);
      dirty = true;
    }
    if (dirty) this.save(now);
  }

  view(): PetView {
    const now = Date.now();
    return {
      act: this.act,
      actT: Math.floor((now - this.actAt) / 250),
      night: this.night,
      asleep: this.asleep(now),
      hunger: this.hunger,
      happy: this.happy,
      poops: this.poops,
      typing: now - this.lastKey < 1500,
      reading: now - this.lastOut < 3000,
      hop: now < this.hopUntil,
      attention: this.hunger === 0 || this.happy === 0 || this.poops > 0,
    };
  }
}

function safeStorage(): Store | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
