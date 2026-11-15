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

test("click toggles the picker", () => {
  render(<SnapPicker onSnap={() => []} />);
  const h = screen.getByLabelText("Layouts");
  fireEvent.click(h);
  expect(h.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(h);
  expect(h.getAttribute("aria-expanded")).toBe("false");
});

test("blur to outside closes; blur within keeps open", () => {
  render(<SnapPicker onSnap={() => []} />);
  const h = screen.getByLabelText("Layouts");
  const wrap = h.parentElement as HTMLElement;
  fireEvent.focus(h);
  fireEvent.blur(wrap, { relatedTarget: h });
  expect(h.getAttribute("aria-expanded")).toBe("true");
  fireEvent.blur(wrap, { relatedTarget: document.body });
  expect(h.getAttribute("aria-expanded")).toBe("false");
});

test("cancel on the confirmation returns to templates without applying", () => {
  const onSnap = vi.fn((_t: string, _c?: boolean) => ["x"]);
  render(<SnapPicker onSnap={onSnap} />);
  fireEvent.mouseEnter(screen.getByLabelText("Layouts"));
  fireEvent.click(screen.getByLabelText("Single"));
  expect(screen.getByText(/Close 1 pane and kill its shell/)).toBeTruthy();
  fireEvent.click(screen.getByText("Cancel"));
  expect(screen.getByLabelText("2 × 2")).toBeTruthy();
  expect(onSnap).toHaveBeenCalledTimes(1);
});

test("picker has a heading and arrow keys move between layouts", () => {
  render(<SnapPicker onSnap={vi.fn(() => [])} />);
  fireEvent.focus(screen.getByLabelText("Layouts"));
  expect(screen.getByText("Pick a layout")).toBeTruthy();
  const group = screen.getByRole("group", { name: "Snap layouts" });
  const opts = group.querySelectorAll<HTMLElement>("button.snap");
  opts[0].focus();
  fireEvent.keyDown(group, { key: "ArrowRight" });
  expect(document.activeElement).toBe(opts[1]);
  fireEvent.keyDown(group, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(opts[0]);
  fireEvent.keyDown(group, { key: "ArrowDown" });
  expect(document.activeElement).toBe(opts[3]);
});
