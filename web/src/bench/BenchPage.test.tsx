import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ writes: 0, themes: [] as unknown[] }));
vi.mock("../terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    write(_d: Uint8Array, cb?: () => void) {
      h.writes++;
      cb?.();
    }
    setTheme(t: unknown) {
      h.themes.push(t);
    }
    dispose() {}
  },
}));
vi.mock("./backend", () => ({ detectBackend: async () => "WebGL2" }));

import { BenchPage } from "./BenchPage";

test("shows backend, replays the fixture, toggles transparency", async () => {
  render(<BenchPage />);
  await waitFor(() =>
    expect(screen.getByTestId("backend").textContent).toBe("WebGL2"),
  );
  const btn = screen.getByRole("button", { name: /run replay/i });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
  await waitFor(() =>
    expect(screen.getByTestId("result").textContent).toMatch(/MB\/s.*p95/),
  );
  expect(h.writes).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(h.themes.at(-1)).toEqual({ background: "rgba(0,0,0,0)" });
  expect(screen.getByTestId("fps").textContent).toMatch(/FPS/);
});
