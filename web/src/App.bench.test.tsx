import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("./bench/BenchPage", () => ({
  BenchPage: () => <div data-testid="bench-stub" />,
}));
vi.mock("./TerminalPane", () => ({
  TerminalPane: () => <div data-testid="pane-stub" />,
}));

import { App } from "./App";

test("dev /bench route lazily renders the bench page", async () => {
  window.history.pushState({}, "", "/bench");
  render(<App />);
  expect(await screen.findByTestId("bench-stub")).toBeTruthy();
  expect(screen.queryByTestId("pane-stub")).toBeNull();
  window.history.pushState({}, "", "/");
});
