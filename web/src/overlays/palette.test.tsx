import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import {
  clearCommands,
  fuzzyMatch,
  groupCommands,
  matchIndices,
  recordRecent,
  getRecents,
  registerCommand,
  type Command,
} from "./commands";

beforeEach(() => {
  clearCommands();
  localStorage.clear();
});

const cmd = (id: string, title: string, group?: string): Command => ({
  id,
  title,
  group,
  run: () => {},
});

describe("matchIndices", () => {
  it("returns matched positions or null", () => {
    expect(matchIndices("nt", "New Terminal")).toEqual([0, 4]);
    expect(matchIndices("", "abc")).toEqual([]);
    expect(matchIndices("zz", "abc")).toBeNull();
  });
});

describe("groupCommands", () => {
  const all = [
    cmd("a", "New scene", "Scenes"),
    cmd("b", "Theme: Dark", "Themes"),
    cmd("c", "Sign out", "Account"),
    cmd("d", "Split pane", "Panes"),
    cmd("e", "Other"),
  ];
  it("groups in fixed order with sentence-case headings", () => {
    const g = groupCommands(all, "", []);
    expect(g.map((x) => x.heading)).toEqual([
      "Scenes",
      "Panes",
      "Themes",
      "Account",
      "Other",
    ]);
  });
  it("shows recents first when the query is empty", () => {
    const g = groupCommands(all, "", ["c", "a", "gone"]);
    expect(g[0].heading).toBe("Recent");
    expect(g[0].items.map((c) => c.id)).toEqual(["c", "a"]);
  });
  it("filters by query and has no recents section", () => {
    const g = groupCommands(all, "sc", ["c"]);
    expect(g.map((x) => x.heading)).toEqual(["Scenes"]);
  });
});

describe("recents", () => {
  it("records most recent first, deduped and capped", () => {
    for (const id of ["1", "2", "3", "4", "5", "6", "2"]) recordRecent(id);
    expect(getRecents()).toEqual(["2", "6", "5", "4", "3"]);
  });
  it("returns [] when stored recents are corrupt JSON", () => {
    localStorage.setItem("tdog.recentCommands", "{not json");
    expect(getRecents()).toEqual([]);
  });
});

describe("palette rendering", () => {
  it("shows headings, shortcuts, swatches, highlights and empty state", () => {
    registerCommand({
      id: "t",
      title: "Theme: Dark",
      group: "Themes",
      swatch: ["#111", "#222", "#333", "#444", "#555"],
      run: vi.fn(),
    });
    registerCommand({
      id: "s",
      title: "Open settings",
      group: "Panes",
      shortcut: "⌘,",
      run: vi.fn(),
    });
    render(<CommandPalette defaultOpen />);
    expect(screen.getByText("Themes")).toBeTruthy();
    expect(screen.getByText("⌘,")).toBeTruthy();
    expect(document.querySelectorAll(".swatch i")).toHaveLength(5);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "set" } });
    expect(document.querySelectorAll("mark").length).toBe(3);
    fireEvent.change(input, { target: { value: "qqq" } });
    expect(screen.getByText("No commands match ‘qqq’.")).toBeTruthy();
  });
  it("lists recently run commands first and records on run", async () => {
    registerCommand({ id: "a", title: "Alpha", run: vi.fn() });
    registerCommand({ id: "b", title: "Beta", run: vi.fn() });
    const { unmount } = render(<CommandPalette defaultOpen />);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("option")[1]);
    });
    unmount();
    render(<CommandPalette defaultOpen />);
    expect(screen.getByText("Recent")).toBeTruthy();
    expect(screen.getAllByRole("option")[0].textContent).toContain("Beta");
  });
});

describe("palette menu look", () => {
  it("renders icon slot, search field, shortcut chip and help footer", () => {
    registerCommand({
      id: "s",
      title: "Open settings",
      group: "Panes",
      icon: "gear",
      shortcut: "⌘,",
      run: vi.fn(),
    });
    render(<CommandPalette defaultOpen />);
    const opt = screen.getByRole("option");
    expect(opt.querySelector('svg[data-icon="gear"]')).toBeTruthy();
    expect(opt.querySelector("kbd")?.textContent).toBe("⌘,");
    expect(document.querySelector(".cmdk-filter svg")).toBeTruthy();
    expect(screen.getByText("↑↓ move · ↵ run")).toBeTruthy();
    expect(screen.getByRole("combobox").getAttribute("aria-controls")).toBe(
      "cmdk-list",
    );
  });
});

describe("palette rows", () => {
  it("keeps label text intact when highlighted, in one inline span", () => {
    registerCommand({ id: "h", title: "Hints: open URL", run: vi.fn() });
    render(<CommandPalette defaultOpen />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "spl" },
    });
    const label = screen.getByRole("option").querySelector(".cmdk-label")!;
    expect(label.textContent).toBe("Hints: open URL");
    expect(label.querySelectorAll("mark").length).toBe(3);
  });
  it("reserves the icon slot on every row and marks danger rows", () => {
    registerCommand({ id: "a", title: "Alpha", icon: "gear", run: vi.fn() });
    registerCommand({ id: "b", title: "Beta", danger: true, run: vi.fn() });
    render(<CommandPalette defaultOpen />);
    const [a, b] = screen.getAllByRole("option");
    expect(a.querySelector(".cmdk-icon svg")).toBeTruthy();
    expect(b.querySelector(".cmdk-icon")).toBeTruthy();
    expect(b.querySelector(".cmdk-icon svg")).toBeNull();
    expect(b.className).toBe("danger");
    expect(a.className).toBe("");
  });
});

describe("fuzzyMatch", () => {
  it("matches subsequences case-insensitively", () => {
    expect(fuzzyMatch("nt", "New Terminal")).toBe(true);
    expect(fuzzyMatch("xyz", "New Terminal")).toBe(false);
    expect(fuzzyMatch("", "anything")).toBe(true);
  });
});

describe("CommandPalette", () => {
  it("opens on Ctrl+K, filters, navigates and runs with Enter", async () => {
    const a = vi.fn();
    const b = vi.fn();
    registerCommand({ id: "a", title: "Open settings", run: a });
    registerCommand({ id: "b", title: "New terminal", run: b });
    render(<CommandPalette />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    const input = screen.getByRole("combobox");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.change(input, { target: { value: "term" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(b).toHaveBeenCalledOnce();
    expect(a).not.toHaveBeenCalled();
  });
  it("closes on Escape and supports Meta+K", async () => {
    registerCommand({ id: "a", title: "A", run: vi.fn() });
    render(<CommandPalette />);
    await act(async () => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    const input = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Escape" });
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("hover selects and click runs a command", async () => {
    const a = vi.fn();
    const b = vi.fn();
    registerCommand({ id: "a", title: "Alpha", run: a });
    registerCommand({ id: "b", title: "Beta", run: b });
    render(<CommandPalette defaultOpen />);
    const opts = screen.getAllByRole("option");
    fireEvent.mouseMove(opts[1]);
    expect(opts[1].getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      fireEvent.click(opts[1]);
    });
    expect(b).toHaveBeenCalledOnce();
    expect(a).not.toHaveBeenCalled();
  });
  it("unregisters commands", () => {
    const off = registerCommand({ id: "a", title: "A", run: vi.fn() });
    off();
    render(<CommandPalette defaultOpen />);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

describe("CommandPalette preview", () => {
  const setup = () => {
    const preview = vi.fn();
    const revert = vi.fn();
    const run = vi.fn();
    registerCommand({ id: "x", title: "Plain", run: vi.fn() });
    registerCommand({ id: "t", title: "Theme: X", run, preview, revert });
    return { preview, revert, run };
  };
  it("previews while highlighted and reverts when it moves away", () => {
    const { preview, revert } = setup();
    render(<CommandPalette defaultOpen />);
    const input = screen.getByRole("combobox");
    expect(preview).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(preview).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(revert).toHaveBeenCalledOnce();
  });
  it("reverts on Escape", async () => {
    const { preview, revert } = setup();
    render(<CommandPalette defaultOpen />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(preview).toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(revert).toHaveBeenCalled();
  });
  it("runs on Enter", async () => {
    const { run } = setup();
    render(<CommandPalette defaultOpen />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(run).toHaveBeenCalledOnce();
  });
});
