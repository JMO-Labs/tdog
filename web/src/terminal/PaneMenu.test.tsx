import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { ToastProvider } from "../overlays/toast";
import { paneRecording } from "../presets/recording";
import { PaneMenu } from "./PaneMenu";
import type { TerminalSession } from "./session";

const forget = vi.fn(() => Promise.resolve());
vi.mock("../journal/db", () => ({ journalDB: () => ({ forget }) }));

beforeEach(() => {
  localStorage.clear();
  forget.mockClear();
});

function mount() {
  const session = { setRecording: vi.fn(), forget: vi.fn() };
  render(
    <ToastProvider>
      <PaneMenu
        x={0}
        y={0}
        renderer={null}
        paneId="p1"
        session={session as unknown as TerminalSession}
        ops={undefined as never}
        broadcast={undefined as never}
        setOverride={vi.fn()}
        zoom={0}
        setZoom={vi.fn()}
        copy={vi.fn()}
        paste={() => Promise.resolve()}
        openOverlay={vi.fn()}
        onDismiss={vi.fn()}
      />
    </ToastProvider>,
  );
  return session;
}

test("Don't record toggles the session and persists", () => {
  const s = mount();
  fireEvent.click(screen.getByText("Don't record this pane"));
  expect(s.setRecording).toHaveBeenCalledWith(false);
  expect(paneRecording("p1")).toBe(false);
});

test("Forget clears the local db and the server copy", () => {
  const s = mount();
  fireEvent.click(screen.getByText("Forget this pane's history"));
  expect(forget).toHaveBeenCalledWith("p1");
  expect(s.forget).toHaveBeenCalled();
  expect(screen.getByText("History for this pane forgotten.")).toBeTruthy();
});
