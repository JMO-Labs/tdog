import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { OverflowMenu } from "./OverflowMenu";

const items = () => [
  { label: "Theme", icon: "dark" as const, onSelect: vi.fn() },
  { label: "Kill all shells", icon: "power" as const, onSelect: vi.fn() },
];

test("opens, runs an item and closes", () => {
  const it = items();
  render(<OverflowMenu items={it} />);
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Kill all shells" }));
  expect(it[1].onSelect).toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("closes on Escape and outside click", () => {
  render(<OverflowMenu items={items()} />);
  const btn = screen.getByRole("button", { name: "More" });
  fireEvent.click(btn);
  expect(btn.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(btn);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
});
