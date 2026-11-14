import { expect, test } from "vitest";
import { tape } from "./tape";

test("tape meter copy and fill follow password length", () => {
  expect(tape(0)).toEqual({
    pct: 0,
    label: "Tape empty. 8 characters minimum.",
  });
  expect(tape(5).label).toBe("3 more characters to go.");
  expect(tape(7).label).toBe("1 more character to go.");
  expect(tape(8).label).toBe("Good enough to record.");
  expect(tape(16)).toEqual({ pct: 100, label: "Full tape. Totally tubular." });
  expect(tape(40).pct).toBe(100);
});
