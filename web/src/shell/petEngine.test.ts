import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  HAPPY_MS,
  HUNGER_MS,
  PetEngine,
  POOP_MS,
  SLEEP_MS,
  STORE_KEY,
  classify,
  drift,
} from "./petEngine";

const DAY = new Date(2026, 5, 1, 12, 0, 0);
const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const mk = (store = mem()) => new PetEngine(store);
const adv = (e: PetEngine, ms: number, step = 250) => {
  for (let t = 0; t < ms; t += step) {
    vi.advanceTimersByTime(step);
    e.tick();
  }
};
const at = (h: number, m = 0) => new Date(2026, 5, 1, h, m, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(DAY);
});
afterEach(() => vi.useRealTimers());

describe("text matchers", () => {
  test.each(["\x07", "Error: x", "build FAILED", "fatal: nope", "panic: x"])(
    "startle on %j",
    (t) => expect(classify(t)).toBe("startle"),
  );
  test.each(["3 passed", "Success", "all done", "✓ ok"])(
    "celebrate on %j",
    (t) => expect(classify(t)).toBe("celebrate"),
  );
  test("neutral, partial words and OSC title BEL are ignored", () => {
    expect(classify("hello terror")).toBeNull();
    expect(classify("\x1b]0;title\x07")).toBeNull();
    expect(classify("undone")).toBeNull();
  });
  test("error beats pass", () => expect(classify("done: error")).toBe("startle"));
});

describe("reactions", () => {
  test("output: reading, hop, then calm", () => {
    const e = mk();
    e.output("ls");
    e.tick();
    expect(e.view().reading).toBe(true);
    expect(e.view().hop).toBe(true);
    adv(e, 500);
    expect(e.view().hop).toBe(false);
    adv(e, 3000);
    expect(e.view().reading).toBe(false);
  });
  test("snack every 8 bursts", () => {
    const e = mk();
    for (let i = 0; i < 8; i++) {
      e.output("x");
      adv(e, 250);
    }
    expect(e.view().hunger).toBe(4);
  });
  test("snack caps at 4", () => {
    const e = mk();
    for (let i = 0; i < 24; i++) {
      e.output("x");
      adv(e, 250);
    }
    expect(e.view().hunger).toBe(4);
  });
  test("typing then yawn after 20s", () => {
    const e = mk();
    e.key();
    expect(e.view().typing).toBe(true);
    adv(e, 19000);
    expect(e.view().act).toBeNull();
    adv(e, 1500);
    expect(e.view().act).toBe("yawn");
    adv(e, 3000);
    expect(e.view().act).toBeNull();
  });
  test("BEL startles, pass celebrates, act expires", () => {
    const e = mk();
    e.output("\x07");
    expect(e.view().act).toBe("startle");
    adv(e, 2000);
    expect(e.view().act).toBeNull();
    e.output("12 passed");
    expect(e.view().act).toBe("celebrate");
  });
});

describe("sleep and night", () => {
  test("sleeps after 5 min idle; typing wakes", () => {
    const e = mk();
    adv(e, SLEEP_MS - 1000, 1000);
    expect(e.view().asleep).toBe(false);
    adv(e, 2000, 1000);
    expect(e.view().asleep).toBe(true);
    e.key();
    expect(e.view().asleep).toBe(false);
  });
  test("asleep at night with moon flag, grumpy when woken", () => {
    vi.setSystemTime(at(23));
    const e = mk();
    expect(e.view().night).toBe(true);
    expect(e.view().asleep).toBe(true);
    e.output("x");
    e.tick();
    expect(e.view().act).toBe("grumpy");
    adv(e, 3500);
    expect(e.view().act).toBeNull();
    expect(e.view().asleep).toBe(true);
  });
  test("typing at night is grumpy too", () => {
    vi.setSystemTime(at(3));
    const e = mk();
    e.key();
    expect(e.view().act).toBe("grumpy");
  });
  test("boundaries: 22:00 night, 07:00 day", () => {
    vi.setSystemTime(at(21, 59));
    const e = mk();
    expect(e.view().night).toBe(false);
    adv(e, 61000, 1000);
    expect(e.view().night).toBe(true);
  });
  test("stretches on first wake after 07:00", () => {
    vi.setSystemTime(at(6, 59));
    const e = mk();
    adv(e, 61000, 1000);
    expect(e.view().night).toBe(false);
    expect(e.view().act).toBe("stretch");
  });
  test("stretches on load after a night away", () => {
    const store = mem();
    store.setItem(
      STORE_KEY,
      JSON.stringify({ hunger: 3, happy: 3, poops: 0, at: at(23).getTime() }),
    );
    vi.setSystemTime(new Date(2026, 5, 2, 8));
    expect(mk(store).view().act).toBe("stretch");
  });
});

describe("care", () => {
  test("A feeds, refuses when full", () => {
    const e = mk();
    e.press("A");
    expect(e.view()).toMatchObject({ act: "eat", hunger: 4 });
    adv(e, 2500);
    e.press("A");
    expect(e.view()).toMatchObject({ act: "full", hunger: 4 });
  });
  test("B plays and raises happy, capped", () => {
    const e = mk();
    e.press("B");
    e.press("B");
    e.press("B");
    expect(e.view()).toMatchObject({ act: "play", happy: 4 });
  });
  test("poop every 20 active min, max 2; C cleans", () => {
    const e = mk();
    for (let i = 0; i < 3 * 20; i++) {
      e.key(); // stay awake
      adv(e, 60000, 60000);
    }
    expect(e.view().poops).toBe(2);
    e.press("C");
    adv(e, 1500);
    expect(e.view().poops).toBe(0);
  });
  test("no poop while asleep", () => {
    const e = mk();
    adv(e, 2 * POOP_MS, 60000); // only the first 5 min are awake
    expect(e.view().poops).toBe(0);
  });
  test("hunger -1 per 45 min, never below 0", () => {
    const e = mk();
    adv(e, HUNGER_MS, 60000);
    expect(e.view().hunger).toBe(2);
    adv(e, 10 * HUNGER_MS, 60000);
    expect(e.view().hunger).toBe(0);
  });
  test("happy -1 per 60 min, sulks at 0, twice as fast with poop", () => {
    const a = mk();
    adv(a, HAPPY_MS, 60000);
    expect(a.view().happy).toBe(2);
    const store = mem();
    store.setItem(
      STORE_KEY,
      JSON.stringify({ hunger: 4, happy: 3, poops: 1, at: Date.now() }),
    );
    const b = mk(store);
    adv(b, HAPPY_MS, 60000);
    expect(b.view().happy).toBe(1);
    adv(b, 10 * HAPPY_MS, 60000);
    expect(b.view().happy).toBe(0);
  });
  test("pip when hungry, sulking or dirty", () => {
    const e = mk();
    expect(e.view().attention).toBe(false);
    adv(e, 3 * HUNGER_MS, 60000);
    expect(e.view().attention).toBe(true);
  });
});

describe("persistence", () => {
  test("saves on change and restores", () => {
    const store = mem();
    const e = mk(store);
    e.press("A");
    e.press("B");
    const b = mk(store);
    expect(b.view()).toMatchObject({ hunger: 4, happy: 4 });
  });
  test("survives broken storage", () => {
    const bad = {
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
    };
    const e = new PetEngine(bad);
    e.press("A");
    expect(e.view().hunger).toBe(4);
    expect(new PetEngine(null).view().hunger).toBe(3);
  });
  test("ignores corrupt data", () => {
    const store = mem();
    store.setItem(STORE_KEY, "{nope");
    expect(mk(store).view().hunger).toBe(3);
  });
  test("drift for time away", () => {
    const s = { hunger: 3, happy: 3, poops: 0, at: 0 };
    expect(drift(s, 2 * HUNGER_MS + 1)).toMatchObject({ hunger: 1, happy: 3 });
    expect(drift(s, 100 * HUNGER_MS)).toMatchObject({ hunger: 0, happy: 0 });
    expect(drift({ ...s, poops: 1 }, HAPPY_MS)).toMatchObject({ happy: 1 });
    expect(drift(s, -5).hunger).toBe(3);
  });
  test("drift applied on load", () => {
    const store = mem();
    store.setItem(
      STORE_KEY,
      JSON.stringify({
        hunger: 3,
        happy: 3,
        poops: 0,
        at: Date.now() - 2 * HUNGER_MS,
      }),
    );
    expect(mk(store).view()).toMatchObject({ hunger: 1, happy: 3 });
  });
});
