import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PaneMenu } from "./PaneMenu";

afterEach(cleanup);

function setup() {
  const p = { onSwap: vi.fn(), onMoveToScene: vi.fn() };
  render(
    <div>
      <PaneMenu id="a" scenes={[{ id: "s2", name: "Two" }]} {...p} />
      <button>outside</button>
    </div>,
  );
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "Pane menu" }));
  return { p, open };
}

test("swap with previous reports -1 and closes the menu", () => {
  const { p, open } = setup();
  open();
  fireEvent.click(screen.getByRole("menuitem", { name: "Swap with previous" }));
  expect(p.onSwap).toHaveBeenCalledWith("a", -1);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("Escape closes the menu; other keys do not", () => {
  const { open } = setup();
  open();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "a" });
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
});

test("focus leaving the menu closes it; focus within keeps it open", () => {
  const { open } = setup();
  open();
  const item = screen.getByRole("menuitem", { name: "Swap with next" });
  fireEvent.blur(item, {
    relatedTarget: screen.getByRole("button", { name: "Pane menu" }),
  });
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.blur(item, { relatedTarget: screen.getByText("outside") });
  expect(screen.queryByRole("menu")).toBeNull();
});
