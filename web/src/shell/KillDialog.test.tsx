import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { KillDialog } from "./KillDialog";

const onConfirm = vi.fn();
const onClose = vi.fn();
beforeEach(() => {
  onConfirm.mockClear();
  onClose.mockClear();
});
afterEach(cleanup);

const show = (count = 3, scope = "all") =>
  render(
    <KillDialog
      open
      count={count}
      scope={scope}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );

test("shows how many shells will die", () => {
  show(3);
  expect(screen.getByText(/3 shells/)).toBeTruthy();
});

test("singular count", () => {
  show(1);
  expect(screen.getByText(/1 shell\b/)).toBeTruthy();
});

test("one click on the kill button confirms", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Nuke" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

test("cancel button closes without killing", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});
