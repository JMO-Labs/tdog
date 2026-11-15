import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MainMenu, type MenuGroup } from "./MainMenu";

afterEach(cleanup);

const groups = (): MenuGroup[] => [
  [
    { label: "Theme…", icon: "system", onSelect: vi.fn() },
    {
      label: "Appearance",
      icon: "light",
      submenu: [
        { label: "System", onSelect: vi.fn(), checked: true },
        { label: "Dark", onSelect: vi.fn(), checked: false },
      ],
    },
  ],
  [{ label: "Sign out", icon: "close", onSelect: vi.fn() }],
];

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  // wait for menu to render
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

test("opens grouped menu and runs an item, closing after", async () => {
  const g = groups();
  render(<MainMenu groups={g} />);
  expect(screen.queryByRole("menu")).toBeNull();
  await open();
  expect(screen.getAllByRole("separator")).toHaveLength(1);
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  expect(
    g[1][0] && "onSelect" in g[1][0] && g[1][0].onSelect,
  ).toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("arrow keys move focus; ArrowRight opens submenu, ArrowLeft closes it", async () => {
  render(<MainMenu groups={groups()} />);
  await open();
  const theme = screen.getByRole("menuitem", { name: "Theme…" });
  expect(document.activeElement).toBe(theme);
  fireEvent.keyDown(theme, { key: "ArrowDown" });
  const app = screen.getByRole("menuitem", { name: "Appearance" });
  expect(document.activeElement).toBe(app);
  expect(app.getAttribute("aria-haspopup")).toBe("menu");
  expect(app.getAttribute("aria-expanded")).toBe("false");
  fireEvent.keyDown(app, { key: "ArrowRight" });
  expect(app.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getAllByRole("menu")).toHaveLength(2);
  const sys = screen.getByRole("menuitemradio", { name: "System" });
  expect(sys.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(sys);
  fireEvent.keyDown(sys, { key: "ArrowDown" });
  expect(document.activeElement).toBe(
    screen.getByRole("menuitemradio", { name: "Dark" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
  expect(screen.getAllByRole("menu")).toHaveLength(1);
  expect(document.activeElement).toBe(app);
});

test("Escape closes every level and refocuses the button", async () => {
  render(<MainMenu groups={groups()} />);
  await open();
  const app = screen.getByRole("menuitem", { name: "Appearance" });
  fireEvent.click(app);
  expect(screen.getAllByRole("menu")).toHaveLength(2);
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Menu" }),
  );
});

test("outside press closes; disabled items do not run", async () => {
  const onSelect = vi.fn();
  render(
    <MainMenu
      groups={[[{ label: "Studio", icon: "brush", disabled: true, onSelect }]]}
    />,
  );
  await open();
  fireEvent.click(screen.getByRole("menuitem", { name: /Studio/ }));
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
});

test("typing to filter shows matching items", async () => {
  render(<MainMenu groups={groups()} />);
  await open();
  const menu = screen.getByRole("menu", { name: "Main menu" });
  fireEvent.keyDown(menu, { key: "a" });
  const filterInput = screen.getByPlaceholderText(
    "Filter actions",
  ) as HTMLInputElement;
  expect(filterInput.value).toBe("a");
  const items = screen.getAllByRole("menuitem");
  // Should show items containing "a": Appearance, Sign out, Theme…
  for (const item of items) {
    const text = item.textContent || "";
    expect(/a/i.test(text)).toBe(true);
  }
});
