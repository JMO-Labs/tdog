import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SnapPicker } from "./SnapPicker";

test("focus opens the picker with six layouts; picking applies", () => {
  const onSnap = vi.fn(() => []);
  render(<SnapPicker onSnap={onSnap} />);
  fireEvent.focus(screen.getByLabelText("Layouts"));
  expect(
    screen.getAllByRole("button", {
      name: /^(Single|2-up|3 columns|1 \+ 2|2 × 2|1 \+ 3)$/,
    }),
  ).toHaveLength(6);
  fireEvent.click(screen.getByLabelText("2 × 2"));
  expect(onSnap).toHaveBeenCalledWith("2x2");
});

test("surplus asks first; confirm applies", () => {
  const onSnap = vi.fn((_t: string, c?: boolean) => (c ? [] : ["x", "y"]));
  render(<SnapPicker onSnap={onSnap} />);
  fireEvent.mouseEnter(screen.getByLabelText("Layouts"));
  fireEvent.click(screen.getByLabelText("Single"));
  expect(screen.getByText(/Close 2 panes/)).toBeTruthy();
  fireEvent.click(screen.getByText("Close and apply"));
  expect(onSnap).toHaveBeenLastCalledWith("single", true);
});

test("Escape closes", () => {
  render(<SnapPicker onSnap={() => []} />);
  const h = screen.getByLabelText("Layouts");
  fireEvent.focus(h);
  fireEvent.keyDown(h, { key: "Escape" });
  expect(h.getAttribute("aria-expanded")).toBe("false");
});
