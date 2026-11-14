import { expect, test, vi } from "vitest";
import { clearScrollback, registerClear } from "./paneActions";

test("clearScrollback runs the registered clear for that pane only", () => {
  const f = vi.fn();
  const off = registerClear("a", f);
  expect(clearScrollback("b")).toBe(false);
  expect(clearScrollback("a")).toBe(true);
  expect(f).toHaveBeenCalledTimes(1);
  off();
  expect(clearScrollback("a")).toBe(false);
});
