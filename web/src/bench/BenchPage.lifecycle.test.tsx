import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ made: [] as string[], disposed: 0 }));
vi.mock("../terminal/resttyRenderer", () => ({
  ResttyRenderer: class {
    constructor() {
      h.made.push("restty");
    }
    write() {}
    setTheme() {}
    setCursor() {}
    setFont() {}
    dispose() {
      h.disposed++;
    }
  },
}));
vi.mock("./backend", () => ({ detectBackend: async () => "none" }));

import { BenchPage } from "./BenchPage";

afterEach(() => {
  vi.useRealTimers();
  window.history.pushState({}, "", "/");
});

test("?renderer=restty creates restty; fps ticks; unmount disposes", async () => {
  window.history.pushState({}, "", "/bench?renderer=restty");
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const { unmount } = render(<BenchPage />);
  await waitFor(() => expect(h.made).toEqual(["restty"]));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: /run replay/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(screen.getByTestId("fps").textContent).toMatch(/FPS/);
  unmount();
  expect(h.disposed).toBe(1);
});

test("?fx=all draws effect overlays in four panes", async () => {
  window.history.pushState({}, "", "/bench?renderer=restty&fx=all");
  const { container } = render(<BenchPage />);
  await waitFor(() => expect(h.made).toContain("restty"));
  expect(container.querySelectorAll(".bench-pane").length).toBe(4);
  expect(container.querySelectorAll(".fx-root").length).toBeGreaterThan(0);
});
