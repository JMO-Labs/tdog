import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Slider } from "./slider";

test("slider is a range input with value and change", () => {
  const fn = vi.fn();
  render(
    <Slider
      aria-label="Size"
      min={10}
      max={20}
      value={14}
      onValueChange={fn}
    />,
  );
  const s = screen.getByRole("slider", { name: "Size" }) as HTMLInputElement;
  expect(s.value).toBe("14");
  fireEvent.change(s, { target: { value: "16" } });
  expect(fn).toHaveBeenCalledWith(16);
});
