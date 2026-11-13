import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "./testutil";

vi.mock("../TerminalPane", () => ({
  TerminalPane: ({ onClosed }: { onClosed?: () => void }) => (
    <button data-testid="terminal-pane" onClick={onClosed}>
      term
    </button>
  ),
}));

import { App } from "../App";

const type = (el: HTMLElement, v: string) =>
  fireEvent.change(el, { target: { value: v } });
const submit = () => fireEvent.submit(document.querySelector("form")!);

afterEach(() => vi.unstubAllGlobals());

const status = (setup: boolean, authenticated: boolean) =>
  json({ setup, authenticated });

test("first run shows setup, then login, then the terminal", async () => {
  const f = mockFetch({
    "GET /api/status": status(true, false),
    "POST /api/setup": json({}),
    "POST /api/login": json({ csrf: "x" }),
  });
  vi.stubGlobal("fetch", f);
  render(<App />);
  type(await screen.findByLabelText("Setup token"), "tok");
  type(screen.getByLabelText("Password"), "longenough1");
  type(screen.getByLabelText("Confirm password"), "longenough1");
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
  await screen.findByRole("heading", { name: /sign in/i });
  type(screen.getByLabelText("Password"), "longenough1");
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  expect(await screen.findByTestId("terminal-pane")).toBeTruthy();
  const setupCall = f.mock.calls.find((c) => c[0] === "/api/setup")!;
  expect(JSON.parse(setupCall[1]!.body as string)).toEqual({
    token: "tok",
    password: "longenough1",
  });
});

test("authenticated session goes straight to the terminal", async () => {
  vi.stubGlobal("fetch", mockFetch({ "GET /api/status": status(false, true) }));
  render(<App />);
  expect(await screen.findByTestId("terminal-pane")).toBeTruthy();
});

test("login focuses the password input and shows bad password", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(false, false),
      "POST /api/login": new Response("no", { status: 401 }),
    }),
  );
  render(<App />);
  const input = await screen.findByLabelText("Password");
  await waitFor(() => expect(document.activeElement).toBe(input));
  type(input, "wrong");
  submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /incorrect password/i,
  );
  expect(document.activeElement).toBe(input);
});

test("rate limited login shows retry-after", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(false, false),
      "POST /api/login": new Response("x", {
        status: 429,
        headers: { "Retry-After": "42" },
      }),
    }),
  );
  render(<App />);
  type(await screen.findByLabelText("Password"), "pw");
  submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(/42s/);
});

test("login returning 409 switches to setup", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(false, false),
      "POST /api/login": new Response("x", { status: 409 }),
    }),
  );
  render(<App />);
  type(await screen.findByLabelText("Password"), "pw");
  submit();
  expect(await screen.findByLabelText("Setup token")).toBeTruthy();
});

test("setup: bad token, mismatch and short password errors", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(true, false),
      "POST /api/setup": new Response("x", { status: 403 }),
    }),
  );
  render(<App />);
  type(await screen.findByLabelText("Setup token"), "bad");
  type(screen.getByLabelText("Password"), "longenough1");
  type(screen.getByLabelText("Confirm password"), "different11");
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /do not match/i,
  );
  type(screen.getByLabelText("Confirm password"), "longenough1");
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toMatch(
      /invalid setup token/i,
    ),
  );
});

test("setup rejects short passwords client-side", async () => {
  vi.stubGlobal("fetch", mockFetch({ "GET /api/status": status(true, false) }));
  render(<App />);
  type(await screen.findByLabelText("Setup token"), "t");
  type(screen.getByLabelText("Password"), "short");
  type(screen.getByLabelText("Confirm password"), "short");
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/at least 8/);
});

test("terminal close with a lost session returns to login", async () => {
  let authed = true;
  vi.stubGlobal(
    "fetch",
    mockFetch({ "GET /api/status": () => status(false, authed) }),
  );
  render(<App />);
  fireEvent.click(await screen.findByTestId("terminal-pane"));
  authed = false;
  fireEvent.click(screen.getByTestId("terminal-pane"));
  expect(await screen.findByRole("button", { name: /sign in/i })).toBeTruthy();
});

const totpReq = () =>
  new Response("totp required", {
    status: 401,
    headers: { "X-TOTP-Required": "1" },
  });
const bodies = (f: ReturnType<typeof mockFetch>) =>
  f.mock.calls
    .filter((c) => c[0] === "/api/login")
    .map((c) => JSON.parse(c[1]!.body as string));

test("2FA: password, then code, then the terminal", async () => {
  let n = 0;
  const f = mockFetch({
    "GET /api/status": status(false, false),
    "POST /api/login": () => (n++ === 0 ? totpReq() : json({ csrf: "x" })),
  });
  vi.stubGlobal("fetch", f);
  render(<App />);
  type(await screen.findByLabelText("Password"), "longenough1");
  submit();
  const code = await screen.findByLabelText("Authentication code");
  await waitFor(() => expect(document.activeElement).toBe(code));
  type(code, "123456");
  submit();
  expect(await screen.findByTestId("terminal-pane")).toBeTruthy();
  expect(bodies(f)).toEqual([
    { password: "longenough1" },
    { password: "longenough1", code: "123456" },
  ]);
});

test("2FA: a bad code shows an error and keeps the code field", async () => {
  let n = 0;
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(false, false),
      "POST /api/login": () =>
        n++ === 0 ? totpReq() : new Response("invalid", { status: 401 }),
    }),
  );
  render(<App />);
  type(await screen.findByLabelText("Password"), "longenough1");
  submit();
  const code = await screen.findByLabelText("Authentication code");
  type(code, "000000");
  submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /invalid authentication code/i,
  );
  expect(screen.getByLabelText("Authentication code")).toBeTruthy();
});

test("any 401 from an authenticated API call returns to login", async () => {
  const { apiFetch } = await import("./api");
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(false, true),
      "GET /api/data": new Response("no", { status: 401 }),
    }),
  );
  render(<App />);
  await screen.findByTestId("terminal-pane");
  await apiFetch("/api/data");
  expect(await screen.findByRole("button", { name: /sign in/i })).toBeTruthy();
});
