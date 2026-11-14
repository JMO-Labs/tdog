import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("./kit/KitPage", () => ({
  KitPage: () => <div data-testid="kit-stub" />,
}));
vi.mock("./TerminalPane", () => ({
  TerminalPane: () => <div data-testid="pane-stub" />,
}));

import { App } from "./App";

test("dev /kit route lazily renders the kit gallery", async () => {
  window.history.pushState({}, "", "/kit");
  render(<App />);
  expect(await screen.findByTestId("kit-stub")).toBeTruthy();
  expect(screen.queryByTestId("pane-stub")).toBeNull();
  window.history.pushState({}, "", "/");
});
