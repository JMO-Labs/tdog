import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { setPref } from "../settings/prefs";
import { ConnectionGag } from "../terminal/ConnectionGag";
import { KillDialog } from "../shell/KillDialog";

beforeEach(() => setPref("serious", true));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("connection drop renders plain text in serious mode", () => {
  render(<ConnectionGag phase="tracking" onReconnect={() => {}} />);
  expect(screen.getByText("Connection lost. Reconnecting…")).toBeTruthy();
  expect(screen.queryByText(/tracking/)).toBeNull();
});

test("kill all renders plain text in serious mode", () => {
  render(
    <KillDialog
      open
      count={2}
      scope="all"
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByText(/2 shells will be terminated/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Hold to confirm" })).toBeTruthy();
  expect(screen.queryByText(/nuke|die/i)).toBeNull();
});
