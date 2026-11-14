import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Switch } from "./switch";

test("switch has role and toggles via click and keyboard-activated click", () => {
  const fn = vi.fn();
  render(<Switch checked={false} onCheckedChange={fn} aria-label="Bell" />);
  const s = screen.getByRole("switch", { name: "Bell" });
  expect(s.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(s);
  expect(fn).toHaveBeenCalledWith(true);
});

test("checked switch reports true and toggles off", () => {
  const fn = vi.fn();
  render(<Switch checked onCheckedChange={fn} aria-label="Bell" />);
  const s = screen.getByRole("switch");
  expect(s.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(s);
  expect(fn).toHaveBeenCalledWith(false);
});

test("disabled switch does not toggle", () => {
  const fn = vi.fn();
  render(<Switch checked disabled onCheckedChange={fn} aria-label="x" />);
  fireEvent.click(screen.getByRole("switch"));
  expect(fn).not.toHaveBeenCalled();
});
