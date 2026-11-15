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
  openTab: vi.fn(),
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

let flows: ReturnType<typeof usePresetFlows>;
function Host() {
  const f = usePresetFlows({ scene: "s1", openTab: m.openTab });
  flows = f;
  return <>{f.dialogs}</>;
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

import { loadLayout, saveLayout } from "../layout/store";
import { paneTheme, scenePreset, setPanePreset } from "./panes";
import { titleStore } from "../terminal/titles";

const two = {
  t: "split" as const,
  id: "s1",
  dir: "row" as const,
  ratio: 0.3,
  a: { t: "leaf" as const, id: "p1", title: "api" },
  b: { t: "leaf" as const, id: "p2" },
};

function liveScene() {
  saveLayout("s1", two);
  setPanePreset("p1", "app");
  titleStore.set("p1", { cwd: "/srv/api", theme: "ack-ack" });
  titleStore.set("p2", { cwd: "/tmp" });
}

const saveAsName = async (name: string, ...clicks: string[]) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: name } });
  for (const c of clicks)
    await act(async () => {
      fireEvent.click(screen.getByText(c));
    });
};

test("Save as writes cwd/title/theme overrides and links the tab", async () => {
  m.listPresets.mockResolvedValue([]);
  m.putScenePreset.mockResolvedValue(undefined);
  liveScene();
  render(<Host />);
  await run("preset:save-scene");
  await saveAsName("mine", "Save");
  const [name, toml] = m.putScenePreset.mock.calls[0];
  expect(name).toBe("mine");
  expect(toml).toContain('cwd = "/srv/api"');
  expect(toml).toContain('theme = "ack-ack"');
  expect(toml).toContain('name = "api"');
  expect(toml).toContain('cwd = "/tmp"');
  expect(scenePreset("s1")).toBe("mine");
});

test("Save overwrites the linked preset without asking", async () => {
  m.putScenePreset.mockResolvedValue(undefined);
  liveScene();
  localStorage.setItem("tdog.scenePresets", '{"s1":"mine"}');
  render(<Host />);
  await run("scene:save");
  expect(m.putScenePreset.mock.calls[0][0]).toBe("mine");
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("Save on an unlinked tab acts as Save as", async () => {
  m.listPresets.mockResolvedValue([]);
  liveScene();
  render(<Host />);
  await run("scene:save");
  expect(screen.getByRole("textbox")).toBeTruthy();
});

test("Save as rejects bad names and warns before overwriting", async () => {
  m.listPresets.mockResolvedValue(["mine"]);
  m.putScenePreset.mockResolvedValue(undefined);
  liveScene();
  render(<Host />);
  await run("preset:save-scene");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Bad Name" },
  });
  expect(screen.getByRole("alert").textContent).toMatch(/lowercase/i);
  await saveAsName("mine", "Overwrite");
  expect(m.putScenePreset).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toMatch(/Overwrite "mine"/);
  await act(async () => {
    fireEvent.click(screen.getByText("Overwrite"));
  });
  expect(m.putScenePreset).toHaveBeenCalledTimes(1);
});

test("save as, reload, open the saved scene restores layout, cwd and themes", async () => {
  m.listPresets.mockResolvedValueOnce([]).mockResolvedValue(["mine"]);
  m.putScenePreset.mockResolvedValue(undefined);
  liveScene();
  const { unmount } = render(<Host />);
  await run("preset:save-scene");
  await saveAsName("mine", "Save");
  const toml = m.putScenePreset.mock.calls[0][1] as string;
  unmount();
  titleStore.clear(); // reload: only localStorage survives

  m.startScene.mockResolvedValue({
    scene: "sc-1",
    name: "mine",
    existing: false,
    panes: [
      { pane: "p1", session: "a" },
      { pane: "p2", session: "b" },
    ],
    layout: {
      type: "split",
      dir: "row",
      ratio: 0.3,
      a: { type: "pane", pane: "p1" },
      b: { type: "pane", pane: "p2" },
    },
  });
  render(<Host />);
  await run("preset:open-scene");
  await act(async () => {
    fireEvent.click(screen.getByText("mine"));
  });
  const [tab, name] = m.openTab.mock.calls[0];
  expect(name).toBe("mine");
  const tree = loadLayout(tab) as typeof two;
  expect(tree.ratio).toBe(0.3);
  expect(tree.a.title).toBe("api");
  expect(paneTheme(tree.a.id)).toBe("ack-ack");
  expect(scenePreset(tab)).toBe("mine");
  expect(toml).toContain('cwd = "/srv/api"'); // the server restarts the shell there
});
