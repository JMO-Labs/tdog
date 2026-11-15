import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { useMemo, useState } from "react";
import { PaneOverlayHost, type PaneOverlayHostHandle } from "./PaneOverlayHost";
import { openFocusedPaneOverlay } from "./focusedPane";
import { registerPaneOverlay } from "./registry";
import type { TerminalRenderer } from "../../terminal/renderer";

registerPaneOverlay({
  id: "probe",
  title: "Probe",
  render: (ctx) => <p>screen: {ctx.screen[0]?.text}</p>,
});
afterEach(cleanup);

function Pane({
  handle,
  text = "$ ls",
}: {
  handle?: { current: PaneOverlayHostHandle };
  text?: string;
}) {
  const rr = useMemo(
    () => ({ screenLines: () => [{ row: 0, text }] }) as TerminalRenderer,
    [text],
  );
  return (
    <div>
      <textarea aria-label="term" />
      <PaneOverlayHost renderer={rr} handle={handle} />
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
      <Pane text="$ one" />
      <Pane text="$ two" />
    </>,
  );
  const [, second] = screen.getAllByLabelText("term");
  fireEvent.focusIn(second);
  act(() => openFocusedPaneOverlay("probe"));
  const dialogs = screen.getAllByRole("dialog");
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0].textContent).toContain("screen: $ two");
});

test("overlays with hooks render, and switching overlays does not crash", () => {
  function WithHooks() {
    const [n] = useState(1);
    const [m] = useState(2);
    return <p>hooks {n + m}</p>;
  }
  registerPaneOverlay({ id: "hooky", title: "Hooky", render: WithHooks });
  const handle: { current: PaneOverlayHostHandle } = {
    current: { open: () => {} },
  };
  render(<Pane handle={handle} />);
  act(() => handle.current.open("probe"));
  act(() => handle.current.open("hooky"));
  expect(screen.getByText("hooks 3")).toBeTruthy();
});
