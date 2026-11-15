import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";
import { SceneDesigner } from "./SceneDesigner";

afterEach(() => vi.unstubAllGlobals());

const stored = [
  'name = "dev"',
  "autostart = true",
  "gap = 6",
  "",
  "[layout]",
  'type = "split"',
  'dir = "row"',
  "ratio = 0.5",
  "",
  "[layout.a]",
  'type = "pane"',
  'pane = "s1"',
  "",
  "[layout.b]",
  'type = "pane"',
  'pane = "s2"',
  "",
  "[[panes]]",
  'id = "s1"',
  'preset = "app"',
  "",
  "[[panes]]",
  'id = "s2"',
  'preset = "logs"',
  "",
].join("\n");

function setup(extra: Parameters<typeof mockFetch>[0] = {}) {
  const f = mockFetch({
    "GET /api/presets/scene": json(["dev"]),
    "GET /api/presets/terminal": json(["app", "logs"]),
    "GET /api/presets/scene/dev": new Response(stored),
    "GET /api/presets/resolve?terminal=app": json({
      theme: { value: "memphis-pop", origin: "global" },
    }),
    "GET /api/presets/resolve?terminal=logs": json({
      theme: { value: "plain", origin: "terminal" },
    }),
    ...extra,
  });
  vi.stubGlobal("fetch", f);
  return f;
}

test("loads a scene, edits slots, saves via PUT, reloads", async () => {
  const f = setup({
    "PUT /api/presets/scene/dev": () => new Response(null, { status: 204 }),
  });
  const onOpen = vi.fn();
  render(<SceneDesigner onOpenScene={onOpen} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  const sw = await screen.findByRole("switch", { name: "Start with server" });
  expect(sw.getAttribute("aria-checked")).toBe("true");
  // go to 3 columns and pick presets
  fireEvent.click(screen.getByRole("radio", { name: "3 columns" }));
  const slot3 = await screen.findByLabelText("Terminal for slot 3");
  fireEvent.change(slot3, { target: { value: "app" } });
  fireEvent.change(screen.getByLabelText("Gap between panes"), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save scene" }));
  await waitFor(() =>
    expect(f.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(true),
  );
  const put = f.mock.calls.find((c) => c[1]?.method === "PUT")!;
  const saved = String(put[1]!.body);
  expect(saved).toContain("gap = 12");
  expect(saved.match(/\[\[panes\]\]/g)).toHaveLength(3);
  expect(saved).toContain("autostart = true");

  // reload: serve the saved body and pick the scene again
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/presets/scene": json(["dev"]),
      "GET /api/presets/terminal": json(["app", "logs"]),
      "GET /api/presets/scene/dev": new Response(saved),
      "GET /api/presets/resolve?terminal=app": json({
        theme: { value: "memphis-pop", origin: "global" },
      }),
      "GET /api/presets/resolve?terminal=logs": json({
        theme: { value: "plain", origin: "terminal" },
      }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "dev" }));
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Gap between panes") as HTMLInputElement).value,
    ).toBe("12"),
  );
  const sel = (n: number) =>
    (screen.getByLabelText(`Terminal for slot ${n}`) as HTMLSelectElement)
      .value;
  expect([sel(1), sel(2), sel(3)]).toEqual(["app", "logs", "app"]);
  expect(
    screen
      .getByRole("switch", { name: "Start with server" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

test("TOML toggle shows source and applies edits back to the form", async () => {
  setup();
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  await screen.findByRole("switch", { name: "Start with server" });
  fireEvent.click(screen.getByRole("radio", { name: "TOML" }));
  const box = screen.getByLabelText("Scene TOML") as HTMLTextAreaElement;
  expect(box.value).toContain('preset = "logs"');
  fireEvent.change(box, {
    target: { value: box.value.replace("gap = 6", "gap = 20") },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Form" }));
  expect(
    (screen.getByLabelText("Gap between panes") as HTMLInputElement).value,
  ).toBe("20");
});

test("Open scene saves, then launches in a new tab", async () => {
  setup({
    "PUT /api/presets/scene/dev": () => new Response(null, { status: 204 }),
  });
  const onOpen = vi.fn(async () => {});
  render(<SceneDesigner onOpenScene={onOpen} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  await screen.findByRole("switch", { name: "Start with server" });
  fireEvent.click(screen.getByRole("button", { name: "Open scene" }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith("dev"));
});

test("slot shows a thumbnail of the preset's look", async () => {
  setup();
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  expect(await screen.findByText("plain")).toBeTruthy();
});

test("slots with different themes preview different colours", async () => {
  setup();
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  await screen.findByText("plain");
  const bg = (n: number) =>
    (
      screen
        .getByTestId(`slot-${n}`)
        .querySelector(".scene-look") as HTMLElement
    ).style.background;
  expect(bg(1)).toBeTruthy();
  expect(bg(2)).toBeTruthy();
  expect(bg(1)).not.toBe(bg(2));
  const bar = screen
    .getByTestId("slot-1")
    .querySelector(".scene-look i") as HTMLElement;
  expect(bar.style.background).toBeTruthy();
});

test("font size is stored as a whole number", async () => {
  const f = setup({
    "PUT /api/presets/scene/dev": () => new Response(null, { status: 204 }),
  });
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  const fs = await screen.findByLabelText("Font size for slot 1");
  expect(fs.getAttribute("step")).toBe("1");
  fireEvent.change(fs, { target: { value: "12.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save scene" }));
  await waitFor(() =>
    expect(f.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(true),
  );
  const put = f.mock.calls.find((c) => c[1]?.method === "PUT")!;
  expect(String(put[1]!.body)).not.toContain("12.5");
});
