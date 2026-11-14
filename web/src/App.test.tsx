import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize() {}
    size() {
      return { cols: 80, rows: 24 };
    }
    mount() {}
    write() {}
    resize() {}
    setTheme() {}
    dispose() {}
  },
}));

class WS {
  static last: WS;
  binaryType = "";
  onopen = null;
  onmessage = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    WS.last = this;
  }
  send() {}
  close() {}
}
vi.stubGlobal("WebSocket", WS);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { App } from "./App";
import { json, mockFetch } from "./auth/testutil";

test("renders the terminal pane and reconnect on close", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": json({ setup: false, authenticated: true }),
    }),
  );
  const { container } = render(<App />);
  await screen.findByTestId("terminal-pane");
  expect(container.querySelector("[data-testid=terminal-pane]")).not.toBeNull();
  await waitFor(() => expect(WS.last).toBeDefined());
  WS.last.onclose!();
  const btn = await screen.findByRole("button", { name: /reconnect/i });
  expect(btn).toBeTruthy();
});

test("?renderer=restty mounts the restty renderer", async () => {
  vi.resetModules();
  const made: string[] = [];
  vi.doMock("./terminal/resttyRenderer", () => ({
    ResttyRenderer: class {
      constructor() {
        made.push("restty");
      }
      onInput() {}
      onResize() {}
      size() {
        return { cols: 80, rows: 24 };
      }
      write() {}
      resize() {}
      setTheme() {}
      dispose() {}
    },
  }));
  window.history.pushState({}, "", "/?renderer=restty");
  const { TerminalPane } = await import("./TerminalPane");
  render(<TerminalPane />);
  await waitFor(() => expect(made).toEqual(["restty"]));
  window.history.pushState({}, "", "/");
});

test("palette sign out sends the CSRF token (from /api/status) and toasts", async () => {
  const fetchMock = mockFetch({
    "GET /api/status": json({ setup: false, authenticated: true, csrf: "tok" }),
    "POST /api/logout": json({}),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  await screen.findByTestId("terminal-pane");
  fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
  await act(async () => {
    fireEvent.click(screen.getByText("Sign out"));
  });
  const call = fetchMock.mock.calls.find(([u]) => u === "/api/logout")!;
  expect((call[1]!.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
    "tok",
  );
  expect(await screen.findByText("Be kind, rewind.")).toBeTruthy();
});

async function signOutEverywhere(serious: boolean) {
  localStorage.setItem("tdog.serious", serious ? "1" : "0");
  let authed = true;
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": () => json({ setup: false, authenticated: authed }),
      "GET /api/session": json({ totp_enabled: false }),
      "POST /api/sessions/revoke-all": () => {
        authed = false;
        return json({});
      },
    }),
  );
  const { container } = render(<App />);
  await screen.findByTestId("terminal-pane");
  fireEvent.keyDown(document, { key: ",", metaKey: true });
  await act(async () => {
    fireEvent.click(await screen.findByText("Sign out everywhere"));
  });
  return container;
}

test("revoke-all toast survives the switch to the login screen", async () => {
  await signOutEverywhere(false);
  await waitFor(() => expect(screen.queryByTestId("terminal-pane")).toBeNull());
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status").textContent).toMatch(/signed out/i);
});

test("serious mode drops the toast headline in the real app", async () => {
  await signOutEverywhere(true);
  const toast = (await screen.findByText("Signed out everywhere.")).closest(
    ".toast",
  )!;
  expect(toast.querySelector("b")).toBeNull();
  localStorage.removeItem("tdog.serious");
});

test("settings POSTs carry the CSRF token; a wrong 2FA code keeps the session", async () => {
  const f = mockFetch({
    "GET /api/status": json({ setup: false, authenticated: true, csrf: "tok" }),
    "GET /api/session": json({ totp_enabled: false }),
    "POST /api/totp/enroll": json({ secret: "ABCD", uri: "otpauth://x" }),
    "POST /api/totp/confirm": json({ error: "invalid code" }, 401),
  });
  vi.stubGlobal("fetch", f);
  render(<App />);
  await screen.findByTestId("terminal-pane");
  fireEvent.keyDown(document, { key: ",", metaKey: true });
  await act(async () => {
    fireEvent.click(await screen.findByRole("switch", { name: /two-factor/i }));
  });
  fireEvent.paste(screen.getAllByRole("textbox")[0], {
    clipboardData: { getData: () => "000000" },
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Confirm"));
  });
  for (const u of ["/api/totp/enroll", "/api/totp/confirm"]) {
    const c = f.mock.calls.find(([x]) => x === u)!;
    expect((c[1]!.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
      "tok",
    );
  }
  expect(screen.getByRole("alert").textContent).toMatch(/didn.t match/i);
  expect(screen.getByTestId("terminal-pane")).toBeTruthy();
});
