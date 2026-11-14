import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "./testutil";
import { timing } from "./signon";

vi.mock("../TerminalPane", () => ({ TerminalPane: () => <p>term</p> }));
import { App } from "../App";

const real = { step: 650, reducedStep: 150, hold: 1400, nono: 2400 };
beforeEach(() => {
  Object.assign(timing, real);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  Object.assign(timing, { step: 0, reducedStep: 0, hold: 0, nono: 0 });
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

test("successful login runs dial-up, then toast and app", async () => {
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
  expect(await screen.findByText("Dialing…")).toBeTruthy();
  for (let i = 0; i < 3; i++)
    await act(() => vi.advanceTimersByTimeAsync(650 + 10));
  expect(screen.getByRole("img", { name: /waving/ })).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(1500));
  expect(screen.getByText("term")).toBeTruthy();
  expect(screen.getByText(/Signed in/)).toBeTruthy();
});

test("sign out shows Be kind, rewind.", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": json({ setup: false, authenticated: true }),
      "POST /api/logout": json({}),
    }),
  );
  render(<App />);
  await screen.findByText("term");
  act(() => {
    dispatchEvent(new Event("tdog:signout"));
  });
  expect(await screen.findByText("Be kind, rewind.")).toBeTruthy();
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
