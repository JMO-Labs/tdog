import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "./testutil";

vi.mock("../TerminalPane", () => ({
  TerminalPane: () => <div data-testid="terminal-pane" />,
}));

import { App } from "../App";

afterEach(() => vi.unstubAllGlobals());

test("setup token field toggles visibility and hints at docker logs", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": json({ setup: true, authenticated: false }),
    }),
  );
  render(<App />);
  const token = (await screen.findByLabelText(
    "Setup token",
  )) as HTMLInputElement;
  expect(token.type).toBe("password");
  expect(screen.getByText(/docker logs tdog/)).toBeTruthy();
  const toggle = screen.getByRole("button", { name: "Show setup token" });
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(toggle);
  expect(token.type).toBe("text");
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(toggle.getAttribute("aria-label")).toBe("Show setup token");
  fireEvent.click(toggle);
  expect(token.type).toBe("password");
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
});

test("theme corner button is a labelled 40px sticker", async () => {
  vi.stubGlobal(
    "fetch",
    mockFetch({
      "GET /api/status": json({ setup: false, authenticated: false }),
    }),
  );
  render(<App />);
  const b = await screen.findByRole("button", { name: /theme/i });
  expect(b.className).toContain("icon-btn");
  const css = readFileSync("src/auth/auth.css", "utf8");
  expect(css).toMatch(/\.corner\s*{[^}]*width:\s*40px[^}]*height:\s*40px/s);
});

test("auth type scale: body 14, labels 13, buttons 15", () => {
  const css = readFileSync("src/auth/auth.css", "utf8");
  expect(css).toMatch(/\.auth-card\s+\.muted\s*{[^}]*font-size:\s*14px/s);
  expect(css).toMatch(/\.auth-card\s+\.btn:not\(\.sm\)\s*{[^}]*font-size:\s*15px/s);
});

test("boot letters are individually composited, not smeared by a parent filter", () => {
  const css = readFileSync("src/auth/auth.css", "utf8");
  const parent = css.match(/\n\.wordmark\s*{[^}]*}/s)![0];
  const span = css.match(/\.wordmark span\s*{[^}]*}/s)![0];
  expect(parent).not.toMatch(/filter:/);
  expect(span).toMatch(/filter:/);
});

test("auth css has no dead wordmark filter override", () => {
  const css = readFileSync("src/auth/auth.css", "utf8");
  expect(css).not.toMatch(/\.wordmark\.big\s*{[^}]*filter:\s*none/s);
});
