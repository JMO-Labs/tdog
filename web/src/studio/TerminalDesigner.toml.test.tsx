import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";

vi.mock("./TerminalPreview", () => ({
  TerminalPreview: ({ draft }: { draft: { cwd?: string } }) => (
    <div data-testid="preview">{draft.cwd}</div>
  ),
}));
import { TerminalDesigner } from "./TerminalDesigner";

const API = 'name = "API"\ncwd = "/srv"\n[font]\nsize = 14\n';
function routes(extra: Parameters<typeof mockFetch>[0] = {}) {
  const f = mockFetch({
    "GET /api/presets/terminal": json(["api"]),
    "GET /api/presets/terminal/api": new Response(API),
    "GET /api/schema/terminal": json({}),
    "POST /api/presets/resolve": json({}),
    ...extra,
  });
  vi.stubGlobal("fetch", f);
  return f;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const toToml = () =>
  fireEvent.click(screen.getByRole("radio", { name: "TOML" }));
const toForm = () =>
  fireEvent.click(screen.getByRole("radio", { name: "Form" }));
const editor = () =>
  screen.getByLabelText("Preset TOML") as HTMLTextAreaElement;

test("form edits show up in the TOML view", async () => {
  routes();
  render(<TerminalDesigner onDirty={() => {}} />);
  const cwd = await screen.findByLabelText("Working directory");
  fireEvent.change(cwd, { target: { value: "/tmp" } });
  toToml();
  expect(editor().value).toContain('cwd = "/tmp"');
});

test("TOML edits show up in the form and the preview", async () => {
  routes();
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Working directory");
  toToml();
  fireEvent.change(editor(), {
    target: { value: 'name = "API"\ncwd = "/opt"\n' },
  });
  expect(screen.getByTestId("preview").textContent).toBe("/opt");
  toForm();
  expect(
    (screen.getByLabelText("Working directory") as HTMLInputElement).value,
  ).toBe("/opt");
});

test("invalid TOML keeps the form state and the typed text", async () => {
  routes();
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Working directory");
  toToml();
  const bad = 'name = "API"\ncwd = = oops\n';
  fireEvent.change(editor(), { target: { value: bad } });
  expect((await screen.findByRole("alert")).textContent).toMatch(/line 2/);
  expect(editor().value).toBe(bad);
  toForm();
  expect(
    (screen.getByLabelText("Working directory") as HTMLInputElement).value,
  ).toBe("/srv");
  toToml();
  expect(editor().value).toBe(bad);
});

test("Try it saves a changed draft, then opens it", async () => {
  const f = routes({
    "PUT /api/presets/terminal/api": new Response(null, { status: 204 }),
  });
  const onTry = vi.fn();
  render(<TerminalDesigner onDirty={() => {}} onTry={onTry} />);
  fireEvent.change(await screen.findByLabelText("Working directory"), {
    target: { value: "/tmp" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Try it" }));
  await waitFor(() => expect(onTry).toHaveBeenCalledWith("api"));
  expect(f.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(1);
});

test("Try it on an unchanged preset opens it without saving", async () => {
  const f = routes();
  const onTry = vi.fn();
  render(<TerminalDesigner onDirty={() => {}} onTry={onTry} />);
  await screen.findByLabelText("Working directory");
  fireEvent.click(screen.getByRole("button", { name: "Try it" }));
  await waitFor(() => expect(onTry).toHaveBeenCalledWith("api"));
  expect(f.mock.calls.some((c) => c[1]?.method === "PUT")).toBe(false);
});

test("Save refuses while the TOML has errors", async () => {
  const f = routes();
  render(<TerminalDesigner onDirty={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Working directory"), {
    target: { value: "/tmp" },
  });
  toToml();
  fireEvent.change(editor(), { target: { value: "cwd = = oops\n" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("status").textContent).toBe(
    "Fix the TOML errors first",
  );
  expect(f.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(0);
});
