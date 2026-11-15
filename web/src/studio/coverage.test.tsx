import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("./TerminalPreview", () => ({ TerminalPreview: () => null }));
import { json, mockFetch } from "../auth/testutil";
import { checkTerminal } from "./schemaCheck";
import { TerminalDesigner } from "./TerminalDesigner";

const SCHEMA = {
  properties: {
    target: { $ref: "#/$defs/target" },
    font: { $ref: "#/$defs/font" },
  },
  $defs: {
    target: { enum: ["ssh-host", "container"] },
    font: {
      properties: { size: { type: "integer", minimum: 6, maximum: 72 } },
    },
  },
};

function routes(extra: Parameters<typeof mockFetch>[0] = {}) {
  const f = mockFetch({
    "GET /api/presets/terminal": json(["api"]),
    "GET /api/presets/terminal/api": new Response('name = "API"\n'),
    "GET /api/schema/terminal": json(SCHEMA),
    "POST /api/presets/resolve": json({}),
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

test("checkTerminal flags below-minimum numbers and unknown enum values", () => {
  const errs = checkTerminal(SCHEMA, {
    font: { size: 2 },
    target: "bogus",
  } as never);
  expect(errs["font.size"]).toBe("Must be at least 6");
  expect(errs.target).toBe("Must be one of ssh-host, container");
});

test("an unreadable preset reports it in the status line", async () => {
  routes({
    "GET /api/presets/terminal/api": new Response("nope", { status: 500 }),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toMatch(
      /Could not open api/,
    ),
  );
});

test("with no presets the designer starts a new one", async () => {
  routes({ "GET /api/presets/terminal": json([]) });
  render(<TerminalDesigner onDirty={() => {}} />);
  expect(await screen.findByRole("radio", { name: "New preset" })).toBeTruthy();
});

test("a server error without a field path shows in the status line", async () => {
  routes({
    "PUT /api/presets/terminal/api": json({ error: "disk full" }, 500),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Name"), {
    target: { value: "API2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("disk full"),
  );
});

test("deleting the last preset starts a new one", async () => {
  routes({
    "DELETE /api/presets/terminal/api": new Response(null, { status: 204 }),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Name");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
  expect(await screen.findByRole("radio", { name: "New preset" })).toBeTruthy();
});

test("a failed delete reports in the status line", async () => {
  routes({
    "DELETE /api/presets/terminal/api": json({ error: "locked" }, 500),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Name");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toMatch(/locked/),
  );
});

test("choice, switch, slider, removals and submit edit the saved toml", async () => {
  const f = routes({
    "PUT /api/presets/terminal/api": new Response(null, { status: 204 }),
  });
  render(<TerminalDesigner onDirty={() => {}} />);
  await screen.findByLabelText("Name");

  // Select (choice) onChange
  fireEvent.change(screen.getByLabelText("Target"), {
    target: { value: "container" },
  });
  // Switch onCheckedChange
  fireEvent.click(screen.getByRole("switch"));
  // Slider onValueChange
  fireEvent.change(screen.getByRole("slider", { name: "Opacity" }), {
    target: { value: "50" },
  });
  // env add + remove
  fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove variable 1" }));
  expect(screen.queryByLabelText("Variable 1 name")).toBeNull();
  // hook add + remove, on all three editors
  for (const label of ["Before start", "After command", "On close"]) {
    fireEvent.click(
      screen.getByRole("button", { name: `Add ${label} command` }),
    );
    fireEvent.change(screen.getByLabelText(`${label} command 1`), {
      target: { value: "x" },
    });
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Before start command 1" }),
  );
  expect(screen.queryByLabelText("Before start command 1")).toBeNull();
  // submit is swallowed (no navigation)
  const form = document.querySelector("form") as HTMLFormElement;
  expect(fireEvent.submit(form)).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls(f, "PUT")).toHaveLength(1));
  const body = String(calls(f, "PUT")[0][1]?.body);
  expect(body).toContain('target = "container"');
  expect(body).toContain("persistent = true");
  expect(body).toContain("opacity = 0.5");
  expect(body).toContain("[post_exec]");
  expect(body).toContain("[on_close]");
  expect(body).not.toContain("[pre_exec]");
});
