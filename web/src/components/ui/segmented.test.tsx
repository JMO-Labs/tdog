import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SegmentedControl } from "./segmented";

const opts = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

test("radiogroup with checked option", () => {
  render(
    <SegmentedControl
      aria-label="Theme"
      options={opts}
      value="dark"
      onValueChange={() => {}}
    />,
  );
  expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy();
  const r = screen.getAllByRole("radio");
  expect(r.map((x) => x.getAttribute("aria-checked"))).toEqual([
    "false",
    "true",
    "false",
  ]);
  expect(r.map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
});

test("click selects", () => {
  const fn = vi.fn();
  render(
    <SegmentedControl
      aria-label="Theme"
      options={opts}
      value="dark"
      onValueChange={fn}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "System" }));
  expect(fn).toHaveBeenCalledWith("system");
});

test("arrow keys move selection with wraparound", () => {
  const fn = vi.fn();
  render(
    <SegmentedControl
      aria-label="Theme"
      options={opts}
      value="system"
      onValueChange={fn}
    />,
  );
  fireEvent.keyDown(screen.getByRole("radio", { name: "System" }), {
    key: "ArrowRight",
  });
  expect(fn).toHaveBeenCalledWith("light");
  fireEvent.keyDown(screen.getByRole("radio", { name: "System" }), {
    key: "ArrowLeft",
  });
  expect(fn).toHaveBeenCalledWith("dark");
});
