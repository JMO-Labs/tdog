import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";
vi.mock("./TerminalPreview", () => ({ TerminalPreview: () => null }));
import { Studio } from "./Studio";

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <Studio open={open} onClose={() => setOpen(false)} />
    </>
  );
}
const nav = () => within(screen.getByRole("navigation", { name: "Studio" }));

beforeEach(() => {
  location.hash = "";
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/presets/terminal": json(["a"]),
      "GET /api/presets/terminal/a": new Response('name = "A"\n'),
      "GET /api/schema/terminal": json({}),
      "POST /api/presets/resolve": json({}),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

test("opens, closes with Back and Esc, focus returns to opener", async () => {
  render(<Host />);
  const opener = screen.getByText("opener");
  opener.focus();
  fireEvent.click(opener);
  const dlg = await screen.findByRole("dialog", { name: "Studio" });
  fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
  // Exit animation never settles in jsdom; focus returns when `open` flips.
  expect(document.activeElement).toBe(opener);
  fireEvent.click(opener);
  fireEvent.keyDown(dlg, { key: "Escape" });
  expect(document.activeElement).toBe(opener);
});

test("nav lists sections, switching updates hash and empty state", async () => {
  render(<Host />);
  fireEvent.click(screen.getByText("opener"));
  await screen.findByRole("dialog");
  expect(
    nav()
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual([
    "Terminal design",
    "Scene design",
    "Themes",
    "Backgrounds",
    "Fonts",
  ]);
  fireEvent.click(nav().getByRole("button", { name: "Backgrounds" }));
  expect(location.hash).toBe("#studio/backgrounds");
  expect(screen.getByRole("heading", { name: "Backgrounds" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Cassette" })).toBeTruthy();
  expect(screen.getByText("Coming in v0.4")).toBeTruthy();
  fireEvent.click(nav().getByRole("button", { name: "Fonts" }));
  expect(location.hash).toBe("#studio/fonts");
  const fonts = nav().getByRole("button", { name: "Fonts" });
  expect(fonts.getAttribute("aria-current")).toBe("page");
});

test("reads the section from the hash", async () => {
  location.hash = "#studio/themes";
  render(<Host />);
  fireEvent.click(screen.getByText("opener"));
  await screen.findByRole("dialog");
  expect(screen.getByRole("heading", { name: "Themes" })).toBeTruthy();
});

test("search filters nav sections and fields by label", async () => {
  render(<Host />);
  fireEvent.click(screen.getByText("opener"));
  await screen.findByRole("dialog");
  const box = screen.getByRole("searchbox", { name: "Search settings" });
  fireEvent.change(box, { target: { value: "font size" } });
  expect(
    nav()
      .getAllByRole("button")
      .map((b) => b.textContent),
  ).toEqual(["Terminal design", "Fonts"]);
  const results = within(
    screen.getByRole("list", { name: "Matching settings" }),
  );
  expect(results.getAllByRole("button").length).toBeGreaterThan(0);
  fireEvent.click(results.getAllByRole("button")[0]);
  expect((box as HTMLInputElement).value).toBe("");
  expect(location.hash).toMatch(/^#studio\//);
  fireEvent.change(box, { target: { value: "zzzz" } });
  expect(screen.getByText("No settings match “zzzz”.")).toBeTruthy();
  expect(nav().queryAllByRole("button")).toHaveLength(0);
});

test("keyboard: arrows move through the nav, Enter picks from search", async () => {
  render(<Host />);
  fireEvent.click(screen.getByText("opener"));
  await screen.findByRole("dialog");
  const box = screen.getByRole("searchbox", { name: "Search settings" });
  box.focus();
  fireEvent.keyDown(box, { key: "ArrowDown" });
  const first = nav().getByRole("button", { name: "Terminal design" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(document.activeElement).toBe(
    nav().getByRole("button", { name: "Scene design" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(box);
  fireEvent.change(box, { target: { value: "backg" } });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(location.hash).toBe("#studio/backgrounds");
});

test("Themes section shows the gallery", async () => {
  location.hash = "#studio/themes";
  render(<Host />);
  fireEvent.click(screen.getByText("opener"));
  await screen.findByRole("dialog");
  expect(screen.getAllByTestId("theme-card").length).toBeGreaterThan(0);
});

test("terminal section hosts the designer and guards unsaved edits", async () => {
  const ask = vi.fn(() => false);
  vi.stubGlobal("confirm", ask);
  render(<Host />);
  fireEvent.click(screen.getByText("opener"));
  fireEvent.change(await screen.findByLabelText("Name"), {
    target: { value: "B" },
  });
  fireEvent.click(nav().getByRole("button", { name: "Fonts" }));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(location.hash).toBe("#studio/terminal");
  ask.mockReturnValue(true);
  fireEvent.click(nav().getByRole("button", { name: "Fonts" }));
  expect(location.hash).toBe("#studio/fonts");
});
