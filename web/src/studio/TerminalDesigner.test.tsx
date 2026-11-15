import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";
import { TerminalDesigner } from "./TerminalDesigner";

const SCHEMA = {
  properties: {
    target: { $ref: "#/$defs/target" },
    font: { $ref: "#/$defs/font" },
    background: { $ref: "#/$defs/background" },
  },
  $defs: {
    target: { enum: ["ssh-host", "container"] },
    font: {
      properties: { size: { type: "integer", minimum: 6, maximum: 72 } },
    },
    background: {
      properties: {
        kind: { enum: ["none", "color"] },
        opacity: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
};
const API = 'name = "API"\ncwd = "/srv"\n[font]\nsize = 14\n';
const RESOLVED = {
  theme: { value: "dracula", origin: "global" },
  cwd: { value: "/srv", origin: "pane" },
  "font.size": { value: 14, origin: "pane" },
};

function routes(extra: Parameters<typeof mockFetch>[0] = {}) {
  const f = mockFetch({
    "GET /api/presets/terminal": json(["api", "web"]),
    "GET /api/presets/terminal/api": new Response(API),
    "GET /api/presets/terminal/web": new Response('name = "Web"\n'),
    "GET /api/schema/terminal": json(SCHEMA),
    "POST /api/presets/resolve": json(RESOLVED),
    ...extra,
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const calls = (f: ReturnType<typeof routes>, m: string) =>
  f.mock.calls.filter((c) => (c[1]?.method ?? "GET") === m);

beforeEach(() => {
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("loads presets, selects the first and shows its fields + origins", async () => {
  routes();
  render(<TerminalDesigner onDirty={() => {}} />);
  const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
  expect(name.value).toBe("API");
  expect(
    (screen.getByLabelText("Working directory") as HTMLInputElement).value,
  ).toBe("/srv");
  expect(
    screen.getByRole("radio", { name: "api" }).getAttribute("aria-checked"),
  ).toBe("true");
  await screen.findByText("global"); // theme inherited from global
  expect(screen.getAllByText("preset").length).toBeGreaterThan(0);
  expect((screen.getByLabelText("Theme") as HTMLInputElement).placeholder).toBe(
    "dracula",
  );
});

test("edit marks dirty, save PUTs toml, reset clears a field", async () => {
  const f = routes({
    "PUT /api/presets/terminal/api": new Response(null, { status: 204 }),
  });
  const onDirty = vi.fn();
  render(<TerminalDesigner onDirty={onDirty} />);
  const cwd = (await screen.findByLabelText(
    "Working directory",
  )) as HTMLInputElement;
  fireEvent.change(cwd, { target: { value: "/tmp" } });
  await waitFor(() => expect(onDirty).toHaveBeenLastCalledWith(true));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls(f, "PUT")).toHaveLength(1));
  expect(calls(f, "PUT")[0][1]?.body).toContain('cwd = "/tmp"');
  await waitFor(() => expect(onDirty).toHaveBeenLastCalledWith(false));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Reset Working directory to inherited",
    }),
  );
  expect(cwd.value).toBe("");
});

test("server validation error lands on its field", async () => {
  routes({
    "PUT /api/presets/terminal/api": json(
      { error: "cwd: must be absolute" },
      400,
    ),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  const cwd = await screen.findByLabelText("Working directory");
  fireEvent.change(cwd, { target: { value: "rel" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "must be absolute",
  );
  expect(cwd.getAttribute("aria-invalid")).toBe("true");
});

test("schema range errors block save before any request", async () => {
  const f = routes();
  render(<TerminalDesigner onDirty={() => {}} />);
  const size = await screen.findByLabelText("Font size");
  fireEvent.change(size, { target: { value: "99" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/at most 72/);
  expect(calls(f, "PUT")).toHaveLength(0);
});

test("new preset gets a slug from its name and is created", async () => {
  const f = routes({
    "PUT /api/presets/terminal/my-box": new Response(null, { status: 204 }),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Name");
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "My box" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls(f, "PUT")).toHaveLength(1));
  expect(screen.getByRole("radio", { name: "my-box" })).toBeTruthy();
});

test("duplicate copies the draft as a new preset", async () => {
  routes();
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Name");
  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
    "API copy",
  );
  expect(
    (screen.getByLabelText("Working directory") as HTMLInputElement).value,
  ).toBe("/srv");
});

test("delete asks first, then DELETEs and drops the tab", async () => {
  const f = routes({
    "DELETE /api/presets/terminal/api": new Response(null, { status: 204 }),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Name");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(calls(f, "DELETE")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() =>
    expect(screen.queryByRole("radio", { name: "api" })).toBeNull(),
  );
  expect(calls(f, "DELETE")).toHaveLength(1);
});

test("switching presets with unsaved edits asks first", async () => {
  routes();
  const confirm = vi.fn(() => false);
  vi.stubGlobal("confirm", confirm);
  render(<TerminalDesigner onDirty={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Working directory"), {
    target: { value: "/x" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "web" }));
  expect(confirm).toHaveBeenCalled();
  expect(
    screen.getByRole("radio", { name: "api" }).getAttribute("aria-checked"),
  ).toBe("true");
});

test("env rows and hook chains edit into the saved toml", async () => {
  const f = routes({
    "PUT /api/presets/terminal/api": new Response(null, { status: 204 }),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Name");
  fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
  fireEvent.change(screen.getByLabelText("Variable 1 name"), {
    target: { value: "A" },
  });
  fireEvent.change(screen.getByLabelText("Variable 1 value"), {
    target: { value: "1" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Add Before start command" }),
  );
  fireEvent.change(screen.getByLabelText("Before start command 1"), {
    target: { value: "make" },
  });
  fireEvent.change(screen.getByLabelText("Before start mode"), {
    target: { value: "stop_on_fail" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls(f, "PUT")).toHaveLength(1));
  const body = String(calls(f, "PUT")[0][1]?.body);
  expect(body).toContain('[env]\nA = "1"');
  expect(body).toContain('[pre_exec]\nmode = "stop_on_fail"\nrun = ["make"]');
});
