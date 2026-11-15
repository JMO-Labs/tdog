import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { PaneOverlayHost, type PaneOverlayHostHandle } from "./PaneOverlayHost";
import { openFocusedPaneOverlay } from "./focusedPane";
import { registerPaneOverlay } from "./registry";
import type { TerminalRenderer } from "../../terminal/renderer";

const r = { screenLines: () => [{ row: 0, text: "$ ls" }] } as TerminalRenderer;
registerPaneOverlay({
  id: "probe",
  title: "Probe",
  render: (ctx) => <p>screen: {ctx.screen[0]?.text}</p>,
});
afterEach(cleanup);

function Pane({ handle }: { handle?: { current: PaneOverlayHostHandle } }) {
  return (
    <div>
      <textarea aria-label="term" />
      <PaneOverlayHost renderer={r} handle={handle} />
    </div>
  );
}

test("the pane's own handle opens an overlay (right-click menu path)", () => {
  const handle: { current: PaneOverlayHostHandle } = {
    current: { open: () => {} },
  };
  render(<Pane handle={handle} />);
  act(() => handle.current.open("probe"));
  expect(screen.getByText("screen: $ ls")).toBeTruthy();
});

test("⌘K opens on the pane that last had focus, before any overlay was open", () => {
  render(
    <>
      <Pane />
      <Pane />
    </>,
  );
  const [, second] = screen.getAllByLabelText("term");
  fireEvent.focusIn(second);
  act(() => openFocusedPaneOverlay("probe"));
  const hosts = screen.getAllByTestId("pane-overlay-host");
  expect(hosts[0].textContent).toBe("");
  expect(hosts[1].textContent).toContain("screen: $ ls");
});
