import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { clearCommands, fuzzyMatch, registerCommand } from "./commands";

beforeEach(() => clearCommands());

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
