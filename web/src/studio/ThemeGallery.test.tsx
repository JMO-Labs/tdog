import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { THEMES } from "../theme/registry";
import { themeStore } from "../theme/store";
import * as api from "../presets/api";
import { ThemeGallery } from "./ThemeGallery";

vi.mock("../presets/api");

beforeEach(() => {
  localStorage.clear();
  themeStore.reset();
  vi.mocked(api.listPresets).mockResolvedValue(["work"]);
  vi.mocked(api.getPresetToml).mockResolvedValue('name = "work"\n');
  vi.mocked(api.putPresetToml).mockResolvedValue();
});

const card = (name: string | RegExp) => screen.getByRole("button", { name });
const cardFor = (id: string) =>
  card(new RegExp(`^${THEMES.find((t) => t.id === id)!.name}`));

test("shows a card per theme with name and inspired-by line", () => {
  render(<ThemeGallery />);
  expect(screen.getAllByTestId("theme-card")).toHaveLength(THEMES.length);
  expect(screen.getByText(/Inspired by Mars Attacks!/)).toBeTruthy();
});

test("filters by light/dark and by name", () => {
  render(<ThemeGallery />);
  fireEvent.click(screen.getByRole("radio", { name: "Light" }));
  const n = screen.getAllByTestId("theme-card").length;
  expect(n).toBeLessThan(THEMES.length);
  fireEvent.click(screen.getByRole("radio", { name: "All" }));
  fireEvent.change(screen.getByLabelText("Search themes"), {
    target: { value: "ack ack" },
  });
  expect(screen.getAllByTestId("theme-card")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Search themes"), {
    target: { value: "zzzzqq" },
  });
  expect(screen.getByText(/No themes match/)).toBeTruthy();
});

test("hover and focus preview, leave and Esc revert", () => {
  render(<ThemeGallery />);
  const before = themeStore.get().id;
  const c = cardFor("ack-ack");
  fireEvent.mouseEnter(c);
  expect(themeStore.get().id).toBe("ack-ack");
  fireEvent.mouseLeave(c);
  expect(themeStore.get().id).toBe(before);
  fireEvent.focus(c);
  expect(themeStore.get().id).toBe("ack-ack");
  fireEvent.keyDown(c, { key: "Escape" });
  expect(themeStore.get().id).toBe(before);
  fireEvent.focus(c);
  fireEvent.blur(c);
  expect(themeStore.get().id).toBe(before);
});

test("unmounting reverts a live preview", () => {
  const { unmount } = render(<ThemeGallery />);
  const before = themeStore.get().id;
  fireEvent.mouseEnter(cardFor("ack-ack"));
  unmount();
  expect(themeStore.get().id).toBe(before);
});

test("apply to this terminal and as default persist the selection", () => {
  render(<ThemeGallery />);
  fireEvent.click(cardFor("ack-ack"));
  fireEvent.click(screen.getByRole("button", { name: "This terminal" }));
  expect(themeStore.get().id).toBe("ack-ack");
  expect(localStorage.getItem("tdog.theme.id")).toBe("ack-ack");
  fireEvent.click(cardFor("bayside"));
  fireEvent.click(
    screen.getByRole("button", { name: "Default for new terminals" }),
  );
  expect(localStorage.getItem("tdog.theme.id")).toBe("bayside");
});

test("apply to a terminal preset writes its theme", async () => {
  render(<ThemeGallery />);
  fireEvent.click(cardFor("ack-ack"));
  const sel = await screen.findByLabelText("Terminal preset");
  await screen.findByRole("option", { name: "work" });
  fireEvent.change(sel, { target: { value: "work" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply to preset" }));
  await waitFor(() =>
    expect(api.putPresetToml).toHaveBeenCalledWith(
      "terminal",
      "work",
      'name = "work"\ntheme = "ack-ack"\n',
    ),
  );
  expect(await screen.findByText(/Saved to work/)).toBeTruthy();
});

test("preset errors are shown", async () => {
  vi.mocked(api.putPresetToml).mockRejectedValue(new Error("bad theme"));
  render(<ThemeGallery />);
  fireEvent.click(cardFor("ack-ack"));
  const sel = await screen.findByLabelText("Terminal preset");
  await screen.findByRole("option", { name: "work" });
  fireEvent.change(sel, { target: { value: "work" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply to preset" }));
  expect(await screen.findByText(/bad theme/)).toBeTruthy();
});

test("randomize selects a card and previews it", () => {
  render(<ThemeGallery />);
  fireEvent.click(screen.getByRole("button", { name: "Randomize" }));
  expect(
    screen
      .getAllByTestId("theme-card")
      .filter((c) => c.getAttribute("aria-pressed") === "true"),
  ).toHaveLength(1);
});

test("survives a failing preset list fetch", async () => {
  vi.mocked(api.listPresets).mockRejectedValue(new Error("boom"));
  render(<ThemeGallery />);
  await waitFor(() => expect(api.listPresets).toHaveBeenCalled());
  await Promise.resolve();
  expect(screen.getAllByTestId("theme-card")).toHaveLength(THEMES.length);
});
