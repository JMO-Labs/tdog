import { expect, test } from "vitest";
import { text } from "../copy/copy";
import { tape } from "./tape";

const label = (n: number, serious: boolean) => {
  const m = tape(n);
  return text(m.key, serious, m.vars);
};

test("tape meter fill and fun copy follow password length", () => {
  expect(tape(0).pct).toBe(0);
  expect(label(0, false)).toBe("Tape empty. 8 characters minimum.");
  expect(label(5, false)).toBe("3 more characters to go.");
  expect(label(7, false)).toBe("1 more character to go.");
  expect(label(8, false)).toBe("Good enough to record.");
  expect(tape(16).pct).toBe(100);
  expect(label(16, false)).toBe("Full tape. Totally tubular.");
  expect(tape(40).pct).toBe(100);
});

test("tape meter copy is plain in serious mode", () => {
  expect(label(0, true)).toBe("Password too short. 8 characters minimum.");
  expect(label(5, true)).toBe("3 more characters needed.");
  expect(label(7, true)).toBe("1 more character needed.");
  expect(label(8, true)).toBe("Password accepted.");
  expect(label(16, true)).toBe("Strong password.");
});
