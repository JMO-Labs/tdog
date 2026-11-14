import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Select } from "./select";

test("select renders options, wrapper has chevron, change fires", () => {
  const fn = vi.fn();
  const { container } = render(
    <Select aria-label="Font" value="a" onChange={fn}>
      <option value="a">A</option>
      <option value="b">B</option>
    </Select>,
  );
  const sel = screen.getByRole("combobox", { name: "Font" });
  expect(screen.getAllByRole("option")).toHaveLength(2);
  expect(container.querySelector(".select svg")).toBeTruthy();
  fireEvent.change(sel, { target: { value: "b" } });
  expect(fn).toHaveBeenCalled();
});
