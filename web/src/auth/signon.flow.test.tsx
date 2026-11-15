import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "./testutil";
import { timing } from "./signon";

vi.mock("../TerminalPane", () => ({ TerminalPane: () => <p>term</p> }));
import { App } from "../App";

const real = { load: 450, nono: 2400 };
beforeEach(() => {
  Object.assign(timing, real);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  Object.assign(timing, { load: 0, nono: 0 });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pw = (v: string) =>
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: v } });

test("wrong password pops the CRT, auto-dismisses after 2.4s", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": json({ setup: false, authenticated: false }),
      "POST /api/login": json({}, 401),
    }),
  );
  render(<App />);
  await screen.findByText("Welcome back");
  pw("nope");
  fireEvent.submit(document.querySelector("form")!);
  expect(await screen.findByText("Ah ah ah!")).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(2300));
  expect(screen.queryByText("Ah ah ah!")).not.toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(200));
  expect(screen.queryByText("Ah ah ah!")).toBeNull();
});

test("successful login shows a loading bar, then toast and app", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": json({ setup: false, authenticated: false }),
      "POST /api/login": json({ csrf: "x" }),
    }),
  );
  render(<App />);
  await screen.findByText("Welcome back");
  pw("right");
  fireEvent.submit(document.querySelector("form")!);
  expect(await screen.findByRole("progressbar")).toBeTruthy();
  expect(document.querySelector(".confetti-canvas")).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(460));
  expect(screen.getByText("term")).toBeTruthy();
  expect(screen.getByText(/Signed in/)).toBeTruthy();
});

async function loginThenSignOut(logoutRes: Response) {
  const f = mockFetch({
    "GET /api/status": json({ setup: false, authenticated: false }),
    "POST /api/login": json({ csrf: "tok123" }),
    "POST /api/logout": logoutRes,
  });
  vi.stubGlobal("fetch", f);
  render(<App />);
  await screen.findByText("Welcome back");
  pw("right");
  fireEvent.submit(document.querySelector("form")!);
  await screen.findByRole("progressbar");
  await act(() => vi.advanceTimersByTimeAsync(460));
  await screen.findByText("term");
  act(() => {
    dispatchEvent(new Event("tdog:signout"));
  });
  return f;
}

test("sign out sends the CSRF token and shows Be kind, rewind.", async () => {
  const f = await loginThenSignOut(json({}));
  expect(await screen.findByText("Be kind, rewind.")).toBeTruthy();
  const call = f.mock.calls.find(([u]) => u === "/api/logout")!;
  const h = call[1]!.headers as Record<string, string>;
  expect(h["X-CSRF-Token"]).toBe("tok123");
});

test("failed logout (403) shows an error and stays signed in", async () => {
  await loginThenSignOut(json({}, 403));
  expect(await screen.findByText(/Couldn.t sign out/)).toBeTruthy();
  expect(screen.queryByText("Be kind, rewind.")).toBeNull();
  expect(screen.getByText("term")).toBeTruthy();
});

test("card shakes on wrong password", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": json({ setup: false, authenticated: false }),
      "POST /api/login": json({}, 401),
    }),
  );
  render(<App />);
  await screen.findByText("Welcome back");
  pw("nope");
  fireEvent.submit(document.querySelector("form")!);
  await screen.findByText("Ah ah ah!");
  expect(document.querySelector("form.shake")).not.toBeNull();
});
