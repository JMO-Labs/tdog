import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useState } from "react";
import { OtpBoxes } from "./otp";

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <OtpBoxes
      value={v}
      onChange={(x) => {
        setV(x);
        onChange?.(x);
      }}
    />
  );
}
const box = (n: number) =>
  screen.getByLabelText(`Digit ${n}`) as HTMLInputElement;

test("typing a digit advances focus; non-digits are ignored", () => {
  render(<Harness />);
  fireEvent.change(box(1), { target: { value: "x" } });
  expect(box(1).value).toBe("");
  fireEvent.change(box(1), { target: { value: "4" } });
  expect(box(1).value).toBe("4");
  expect(document.activeElement).toBe(box(2));
});

test("backspace on an empty box moves back", () => {
  render(<Harness />);
  fireEvent.change(box(1), { target: { value: "4" } });
  fireEvent.keyDown(box(2), { key: "Backspace" });
  expect(document.activeElement).toBe(box(1));
});

test("pasting a 6-digit code fills every box", () => {
  const on = vi.fn();
  render(<Harness onChange={on} />);
  fireEvent.paste(box(3), {
    clipboardData: { getData: () => " 123 456 " },
  });
  for (let i = 1; i <= 6; i++) expect(box(i).value).toBe(String(i));
  expect(on).toHaveBeenLastCalledWith("123456");
});
