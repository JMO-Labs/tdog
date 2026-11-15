import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { clearCommands, getCommands } from "../overlays/commands";

const m = vi.hoisted(() => ({
  toast: vi.fn(),
  listPresets: vi.fn(),
  startScene: vi.fn(),
  putScenePreset: vi.fn(),
}));

vi.mock("../overlays/toast", () => ({ useToast: () => m.toast }));
vi.mock("./api", () => ({
  PresetError: class extends Error {},
  listPresets: m.listPresets,
  startScene: m.startScene,
  putScenePreset: m.putScenePreset,
  resolvePreset: vi.fn(),
}));

import { usePresetFlows } from "./usePresetFlows";

function Host() {
  return <>{usePresetFlows({ scene: "s1", openTab: () => {} })}</>;
}

beforeEach(() => {
  clearCommands();
  localStorage.clear();
  Object.values(m).forEach((f) => f.mockReset());
});

const run = async (id: string) => {
  await act(async () =>
    getCommands()
      .find((c) => c.id === id)!
      .run(),
  );
};

test("opening presets toasts info when none exist", async () => {
  m.listPresets.mockResolvedValue([]);
  render(<Host />);
  await run("preset:open-scene");
  expect(m.toast).toHaveBeenCalledWith("info", "No scene presets yet.");
});

test("opening presets toasts the error when listing fails", async () => {
  m.listPresets.mockRejectedValue(new Error("boom"));
  render(<Host />);
  await run("preset:pane");
  expect(m.toast).toHaveBeenCalledWith("fail", "boom");
});

test("the picker closes on Escape", async () => {
  m.listPresets.mockResolvedValue(["dev"]);
  render(<Host />);
  await run("preset:open-scene");
  expect(screen.getByText("dev")).toBeTruthy();
  await act(async () => {
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  });
  await waitFor(() => expect(screen.queryByText("dev")).toBeNull());
});

test("saving with no panes toasts info and closes the dialog", async () => {
  render(<Host />);
  await run("preset:save-scene");
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "mine" } });
  await act(async () => {
    fireEvent.click(screen.getByText("Save"));
  });
  expect(m.putScenePreset).not.toHaveBeenCalled();
  expect(m.toast).toHaveBeenCalledWith(
    "info",
    "Nothing to save: this scene has no panes.",
  );
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
});

test("the name dialog closes on Cancel", async () => {
  render(<Host />);
  await run("preset:save-scene");
  await act(async () => {
    fireEvent.click(screen.getByText("Cancel"));
  });
  await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
});
