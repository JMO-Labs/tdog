import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Field } from "./field";
import { Input } from "./input";

test("input is typeable", () => {
  const fn = vi.fn();
  render(<Input aria-label="name" onChange={fn} />);
  fireEvent.change(screen.getByLabelText("name"), { target: { value: "a" } });
  expect(fn).toHaveBeenCalled();
});

test("field labels the control and shows hint", () => {
  render(
    <Field label="Host" hint="e.g. box">
      <Input />
    </Field>,
  );
  const input = screen.getByLabelText("Host");
  expect(screen.getByText("e.g. box")).toBeTruthy();
  expect(input.getAttribute("aria-describedby")).toBe(
    screen.getByText("e.g. box").id,
  );
  expect(input.getAttribute("aria-invalid")).toBeNull();
});

test("field error replaces hint, marks invalid, announces", () => {
  render(
    <Field label="Host" hint="e.g. box" error="Required">
      <Input />
    </Field>,
  );
  const input = screen.getByLabelText("Host");
  expect(screen.queryByText("e.g. box")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe("Required");
  expect(input.getAttribute("aria-invalid")).toBe("true");
});
