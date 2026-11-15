import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ActionMenu, type MenuItem } from "./ActionMenu";

afterEach(cleanup);

const groups = (pick = vi.fn()): MenuItem[][] => [
  [
    {
      label: "Layouts",
      submenu: [
        { label: "Single", onSelect: () => pick("single") },
        { label: "2-up", onSelect: () => pick("2-up") },
      ],
    },
    { label: "Rename", onSelect: () => pick("rename") },
  ],
];

test("ArrowRight focuses the submenu; a re-render with new coordinates keeps it there", () => {
  const { rerender } = render(
    <ActionMenu x={10} y={10} groups={groups()} onDismiss={() => {}} />,
  );
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Layouts" }), {
    key: "ArrowRight",
  });
  expect(document.activeElement?.textContent).toBe("Single");
  rerender(<ActionMenu x={12} y={14} groups={groups()} onDismiss={() => {}} />);
  expect(document.activeElement?.textContent).toBe("Single");
});

test("ArrowLeft returns focus to the item that opened the submenu", () => {
  render(<ActionMenu x={0} y={0} groups={groups()} onDismiss={() => {}} />);
  const parent = screen.getByRole("menuitem", { name: "Layouts" });
  fireEvent.keyDown(parent, { key: "ArrowRight" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
  expect(screen.queryByRole("menu", { name: "Layouts" })).toBeNull();
  expect(document.activeElement).toBe(parent);
});

test("keepOpen items run without closing the menu", () => {
  const onDismiss = vi.fn();
  const kept = vi.fn();
  render(
    <ActionMenu
      x={0}
      y={0}
      groups={[[{ label: "Step", keepOpen: true, onSelect: kept }]]}
      onDismiss={onDismiss}
    />,
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Step" }));
  expect(kept).toHaveBeenCalled();
  expect(onDismiss).not.toHaveBeenCalled();
});

test("renders on <body>, outside the pane that opened it", () => {
  const { container } = render(
    <div style={{ isolation: "isolate" }}>
      <ActionMenu x={0} y={0} groups={groups()} onDismiss={() => {}} />
    </div>,
  );
  const menu = screen.getByRole("menu");
  expect(container.contains(menu)).toBe(false);
  expect(menu.parentElement).toBe(document.body);
});

test("hovering a submenu item opens it; clicking keeps it open", () => {
  render(<ActionMenu x={0} y={0} groups={groups()} onDismiss={() => {}} />);
  const parent = screen.getByRole("menuitem", { name: /Layouts/ });
  fireEvent.pointerEnter(parent);
  expect(parent.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(parent);
  expect(parent.getAttribute("aria-expanded")).toBe("true");
});

test("menu and submenu roots carry the floating-surface class", () => {
  render(<ActionMenu x={0} y={0} groups={groups()} onDismiss={() => {}} />);
  expect(document.querySelector(".action-menu")!.classList).toContain("float");
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Layouts" }), {
    key: "ArrowRight",
  });
  expect(document.querySelector(".menu-submenu")!.classList).toContain("float");
});
