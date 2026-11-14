import { describe, expect, test } from "vitest";
import { petFrame } from "./petFrame";

describe("petFrame", () => {
  test("awake reads output with eyes looking sideways", () => {
    const f = petFrame({ awake: true, tick: 0, reduced: false });
    expect(f.caption).toBe("Dogbert is reading your output.");
    expect(f.pose).toBe("awake");
    expect(f.cells.length).toBeGreaterThan(40);
  });
  test("asleep lies down with z", () => {
    const f = petFrame({ awake: false, tick: 0, reduced: false });
    expect(f.caption).toBe("Dogbert is asleep. Shells are quiet.");
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
