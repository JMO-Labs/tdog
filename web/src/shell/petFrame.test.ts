import { describe, expect, test } from "vitest";
import { petFrame } from "./petFrame";

describe("petFrame", () => {
  test("awake reads output with eyes looking sideways", () => {
    const f = petFrame({ awake: true, tick: 0, reduced: false });
    expect(f.caption).toBe("pet.reading");
    expect(f.pose).toBe("awake");
    expect(f.cells.length).toBeGreaterThan(40);
  });
  test("asleep lies down with z", () => {
    const f = petFrame({ awake: false, tick: 0, reduced: false });
    expect(f.caption).toBe("pet.asleep");
    expect(f.pose).toBe("sleep");
  });
  test("reduced motion: ticks do not change the frame, poses do", () => {
    const a = petFrame({ awake: true, tick: 0, reduced: true });
    const b = petFrame({ awake: true, tick: 5, reduced: true });
    expect(b.cells).toEqual(a.cells);
    const s = petFrame({ awake: false, tick: 0, reduced: true });
    expect(s.cells).not.toEqual(a.cells);
  });
  test("motion: ticks animate", () => {
    const a = petFrame({ awake: false, tick: 0, reduced: false });
    const b = petFrame({ awake: false, tick: 2, reduced: false });
    expect(b.cells).not.toEqual(a.cells);
  });
  test("mini is the face without tail; sleep mini is lying", () => {
    expect(petFrame({ awake: true, tick: 0, reduced: false }).mini).toBe(
      "face",
    );
    expect(petFrame({ awake: false, tick: 0, reduced: false }).mini).toBe(
      "sleep",
    );
  });
});

describe("petFrame with a live view", () => {
  const v = {
    act: null,
    actT: 0,
    night: false,
    asleep: false,
    hunger: 3,
    happy: 3,
    poops: 0,
    typing: false,
    reading: false,
    hop: false,
    attention: false,
  };
  const cap = (o: Record<string, unknown>, tick = 0, reduced = false) =>
    petFrame({
      awake: true,
      tick,
      reduced,
      view: { ...v, ...(o as object) } as never,
    });
  test.each([
    [{ act: "eat" }, "pet.eat"],
    [{ act: "full" }, "pet.full"],
    [{ act: "play" }, "pet.play"],
    [{ act: "clean", poops: 1 }, "pet.clean"],
    [{ act: "startle" }, "pet.startle"],
    [{ act: "celebrate" }, "pet.celebrate"],
    [{ act: "yawn" }, "pet.yawn"],
    [{ act: "stretch" }, "pet.stretch"],
    [{ act: "grumpy" }, "pet.grumpy"],
    [{ asleep: true, night: true }, "pet.night"],
    [{ asleep: true }, "pet.asleep"],
    [{ happy: 0 }, "pet.sulk"],
    [{ typing: true }, "pet.typing"],
    [{ reading: true }, "pet.reading"],
    [{ hunger: 0 }, "pet.hungry"],
    [{}, "pet.wander"],
  ] as const)("%j -> %s", (o, caption) => {
    expect(cap(o as never).caption).toBe(caption);
  });
  test("poops and moon add cells; wandering moves; reduced pins", () => {
    expect(cap({ poops: 2 }).cells.length).toBeGreaterThan(
      cap({}).cells.length,
    );
    expect(cap({ night: true }).cells.length).toBeGreaterThan(
      cap({}).cells.length,
    );
    expect(cap({}, 30).cells).not.toEqual(cap({}, 0).cells);
    expect(cap({}, 30, true).cells).toEqual(cap({}, 0, true).cells);
  });
  test("eating consumes the bone; play chases the ball", () => {
    const n = (t: number) => cap({ act: "eat", actT: t } as never).cells.length;
    expect(n(12)).toBeLessThan(n(0));
    expect(cap({ act: "play", actT: 0 } as never).cells).not.toEqual(
      cap({ act: "play", actT: 3 } as never).cells,
    );
  });
});
