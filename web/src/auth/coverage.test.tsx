import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import * as api from "./api";
import { message } from "./screens";
import { json, mockFetch } from "./testutil";

vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));

import { App } from "../App";

const type = (el: HTMLElement, v: string) =>
  fireEvent.change(el, { target: { value: v } });
const submit = () => fireEvent.submit(document.querySelector("form")!);
const status = (setup: boolean, authenticated: boolean) =>
  json({ setup, authenticated });

afterEach(() => vi.unstubAllGlobals());

test("status fetch failure falls back to login", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({ "GET /api/status": new Response("x", { status: 500 }) }),
  );
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: /welcome back/i }),
  ).toBeTruthy();
});

test("api.login maps an unexpected status to other", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({ "POST /api/login": new Response("x", { status: 500 }) }),
  );
  expect(await api.login("pw")).toEqual({ ok: false, kind: "other" });
});

test("api.setup maps 400, 409 and other statuses", async () => {
  for (const [code, kind] of [
    [400, "short"],
    [409, "done"],
    [500, "other"],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      mockFetch({ "POST /api/setup": new Response("x", { status: code }) }),
    );
    expect(await api.setup("t", "longenough1")).toEqual({ ok: false, kind });
  }
});

test("login network error shows a generic error", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(false, false),
      "POST /api/login": () => {
        throw new Error("offline");
      },
    }),
  );
  render(<App />);
  type(await screen.findByLabelText("Password"), "pw");
  submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /something went wrong/i,
  );
});

test("setup network error shows a generic error", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": status(true, false),
      "POST /api/setup": () => {
        throw new Error("offline");
      },
    }),
  );
  render(<App />);
  type(await screen.findByLabelText("Setup token"), "t");
  type(screen.getByLabelText("Password"), "longenough1");
  type(screen.getByLabelText("Confirm password"), "longenough1");
  submit();
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /something went wrong/i,
  );
});

test("message covers totp, done and fallback kinds", () => {
  expect(message({ ok: false, kind: "totp" })).toMatch(/authentication code/i);
  expect(message({ ok: false, kind: "done" })).toMatch(/already set up/i);
  expect(message({ ok: false, kind: "other" })).toMatch(
    /something went wrong/i,
  );
});
