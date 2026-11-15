import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";
import { SceneDesigner } from "./SceneDesigner";

afterEach(() => vi.unstubAllGlobals());

const base = {
  "GET /api/presets/scene": json(["dev"]),
  "GET /api/presets/terminal": json(["app"]),
};
const stored = [
  'name = "dev"',
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
  'preset = "app"',
  "",
].join("\n");

function setup(extra: Parameters<typeof mockFetch>[0] = {}) {
  const f = mockFetch({ ...base, ...extra });
  vi.stubGlobal("fetch", f);
  return f;
}
const alert = () => screen.findByRole("alert");
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

test("shows an error when the preset lists can't load", async () => {
  setup({ "GET /api/presets/scene": new Response("boom", { status: 500 }) });
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  expect((await alert()).textContent).toContain("boom");
});

test("a preset that fails to resolve previews as unavailable", async () => {
  setup({
    "GET /api/presets/scene/dev": new Response(stored),
    "GET /api/presets/resolve?terminal=app": new Response("no", {
      status: 500,
    }),
  });
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  expect((await screen.findAllByText("unavailable")).length).toBeGreaterThan(0);
});

test("a scene that can't be read shows the error and clears the editor", async () => {
  setup({
    "GET /api/presets/scene/dev": new Response("gone", { status: 404 }),
  });
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  expect((await alert()).textContent).toContain("gone");
  expect(screen.getByText("Pick a scene or start a new one.")).toBeTruthy();
});

test("new scene: unnamed save is refused; sliders and swatch edit the draft", async () => {
  const f = setup({
    "PUT /api/presets/scene/fresh": () => new Response(null, { status: 204 }),
  });
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  await screen.findByRole("button", { name: "dev" });
  click("New scene");
  const name = screen.getByLabelText("Scene name") as HTMLInputElement;
  expect(name.value).toBe("");
  click("Save scene");
  expect((await alert()).textContent).toContain("Name the scene");
  expect(f.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(false);

  fireEvent.change(name, { target: { value: "fresh" } });
  fireEvent.change(screen.getByLabelText("Main split"), {
    target: { value: "0.7" },
  });
  fireEvent.change(screen.getByLabelText("Pane opacity"), {
    target: { value: "0.5" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Background #223344" }));
  click("Save scene");
  await waitFor(() =>
    expect(f.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(true),
  );
  const body = String(
    f.mock.calls.find((c) => c[1]?.method === "PUT")![1]!.body,
  );
  expect(body).toContain("pane_opacity = 0.5");
  expect(body).toContain("#223344");
  expect(body).toContain("0.7");
});

test("a failed save shows the server's message", async () => {
  setup({
    "PUT /api/presets/scene/fresh": new Response("disk full", { status: 500 }),
  });
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  await screen.findByRole("button", { name: "dev" });
  click("New scene");
  fireEvent.change(screen.getByLabelText("Scene name"), {
    target: { value: "fresh" },
  });
  click("Save scene");
  expect((await alert()).textContent).toContain("disk full");
});

test("broken TOML blocks switching to the form and saving", async () => {
  const f = setup({ "GET /api/presets/scene/dev": new Response(stored) });
  render(<SceneDesigner onOpenScene={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "dev" }));
  await screen.findByLabelText("Main split");
  fireEvent.click(screen.getByRole("radio", { name: "TOML" }));
  const box = screen.getByLabelText("Scene TOML");
  fireEvent.change(box, { target: { value: "gap = nope\n" } });

  fireEvent.click(screen.getByRole("radio", { name: "Form" }));
  expect((await alert()).textContent).toContain("line 1");
  expect(screen.getByLabelText("Scene TOML")).toBeTruthy();

  click("Save scene");
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("line 1"),
  );
  expect(f.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(false);
});
