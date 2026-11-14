import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../terminal/sessions", () => ({
  killScene: vi.fn(),
  findSessionId: vi.fn(),
}));
vi.mock("../TerminalPane", () => ({
  TerminalPane: (p: { sceneKey: string }) => (
    <div data-testid="terminal-pane" data-scene={p.sceneKey} />
  ),
}));

import { Workspace } from "./Workspace";
import { clearCommands } from "../overlays/commands";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  clearCommands();
});

const dt = () => ({
  data: {} as Record<string, string>,
  types: [] as string[],
  effectAllowed: "",
  setData(k: string, v: string) {
    this.data[k] = v;
    this.types.push(k);
  },
  getData(k: string) {
    return this.data[k];
  },
});
const fire = (
  el: Element,
  type: "dragStart" | "dragOver" | "dragLeave" | "drop" | "dragEnd",
  data: ReturnType<typeof dt>,
  pos: { clientX?: number; clientY?: number } = {},
) => {
  const e = createEvent[type](el, { dataTransfer: data, ...pos });
  // jsdom has no DragEvent, so init coords are dropped: set them explicitly.
  for (const [k, v] of Object.entries(pos))
    Object.defineProperty(e, k, { value: v });
  fireEvent(el, e);
};
const order = () =>
  [...document.querySelectorAll("[data-testid=terminal-pane]")].map(
    (e) => (e as HTMLElement).dataset.scene!,
  );
const section = (id: string) =>
  document.querySelector(`[data-pane="${id}"]`) as HTMLElement;
const head = (id: string) => section(id).querySelector(".pane-head")!;

function twoPanes() {
  render(<Workspace />);
  fireEvent.click(screen.getByRole("button", { name: "Split right" }));
  const [a, b] = order();
  section(b).getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  return { a, b };
}

test("dropping on a pane's right edge docks after it, with a highlight", () => {
  const { a, b } = twoPanes();
  const d = dt();
  fire(head(a), "dragStart", d);
  fire(section(b), "dragOver", d, { clientX: 95, clientY: 50 });
  expect(screen.getByTestId("drop-zone").dataset.zone).toBe("right");
  fire(section(b), "drop", d, { clientX: 95, clientY: 50 });
  expect(screen.queryByTestId("drop-zone")).toBeNull();
  expect(order()).toEqual([b, a]);
});

test("dropping in the centre swaps the panes", () => {
  const { a, b } = twoPanes();
  const d = dt();
  fire(head(a), "dragStart", d);
  fire(section(b), "dragOver", d, { clientX: 50, clientY: 50 });
  expect(screen.getByTestId("drop-zone").dataset.zone).toBe("swap");
  fire(section(b), "drop", d, { clientX: 50, clientY: 50 });
  expect(order()).toEqual([b, a]);
});

test("no highlight over the dragged pane itself; dragEnd clears it", () => {
  const { a, b } = twoPanes();
  const d = dt();
  fire(head(a), "dragStart", d);
  fire(section(a), "dragOver", d);
  expect(screen.queryByTestId("drop-zone")).toBeNull();
  fire(section(b), "dragOver", d, { clientX: 5, clientY: 50 });
  expect(screen.getByTestId("drop-zone").dataset.zone).toBe("left");
  fire(head(a), "dragEnd", d);
  fire(section(b), "dragOver", d, { clientX: 5, clientY: 50 });
  expect(screen.queryByTestId("drop-zone")).toBeNull();
});

test("dropping a pane on a scene tab moves it into that scene", () => {
  const { a, b } = twoPanes();
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  fireEvent.click(screen.getAllByRole("tab")[0]);
  const d = dt();
  fire(head(a), "dragStart", d);
  fire(screen.getAllByRole("tab")[1], "dragOver", d);
  fire(screen.getAllByRole("tab")[1], "drop", d);
  const views = [...document.querySelectorAll(".scene-view")];
  const ids = (v: Element) =>
    [...v.querySelectorAll("[data-testid=terminal-pane]")].map(
      (e) => (e as HTMLElement).dataset.scene,
    );
  expect(ids(views[0])).toEqual([b]);
  expect(ids(views[1])).toContain(a);
  expect(ids(views[1])).toHaveLength(2);
});

test("pane menu: swap with next and move to scene work from the keyboard", () => {
  const { a, b } = twoPanes();
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  fireEvent.click(screen.getAllByRole("tab")[0]);
  fireEvent.click(
    within(section(a)).getByRole("button", { name: "Pane menu" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "Swap with next" }));
  expect(order().slice(0, 2)).toEqual([b, a]);
  fireEvent.click(
    within(section(a)).getByRole("button", { name: "Pane menu" }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: /Move to scene 2/ }));
  const first = document.querySelector(".scene-view")!;
  expect(
    [...first.querySelectorAll("[data-testid=terminal-pane]")].map(
      (e) => (e as HTMLElement).dataset.scene,
    ),
  ).toEqual([b]);
});

test("leaving a pane clears its drop highlight", () => {
  const { a, b } = twoPanes();
  const d = dt();
  fire(head(a), "dragStart", d);
  fire(section(b), "dragOver", d, { clientX: 5, clientY: 50 });
  expect(screen.getByTestId("drop-zone")).toBeTruthy();
  fire(section(b), "dragLeave", d);
  expect(screen.queryByTestId("drop-zone")).toBeNull();
});

test("leaving a scene tab clears its drop target highlight", () => {
  const { a } = twoPanes();
  fireEvent.click(screen.getByRole("button", { name: "New scene" }));
  fireEvent.click(screen.getAllByRole("tab")[0]);
  const d = dt();
  fire(head(a), "dragStart", d);
  const wrap = screen.getAllByRole("tab")[1].closest(".tab-wrap")!;
  fire(wrap, "dragOver", d);
  expect(wrap.getAttribute("data-drop")).not.toBeNull();
  fire(wrap, "dragLeave", d);
  expect(wrap.getAttribute("data-drop")).toBeNull();
});
