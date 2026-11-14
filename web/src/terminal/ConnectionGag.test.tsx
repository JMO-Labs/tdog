import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ConnectionGag } from "./ConnectionGag";

afterEach(() => vi.unstubAllGlobals());

test("live renders nothing", () => {
  const { container } = render(
    <ConnectionGag phase="live" onReconnect={() => {}} />,
  );
  expect(container.firstChild).toBeNull();
});

test("tracking shows copy and a working sticker Reconnect", () => {
  const onReconnect = vi.fn();
  render(<ConnectionGag phase="tracking" onReconnect={onReconnect} />);
  expect(screen.getByText("Adjusting tracking…")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(onReconnect).toHaveBeenCalled();
});

test("static draws a canvas", () => {
  const { container } = render(
    <ConnectionGag phase="static" onReconnect={() => {}} />,
  );
  expect(container.querySelector("canvas.static")).toBeTruthy();
});

test("rewinding shows copy", () => {
  render(<ConnectionGag phase="rewinding" onReconnect={() => {}} />);
  expect(screen.getByText("Rewinding…")).toBeTruthy();
});

test("reduced motion marks overlays still", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const { container } = render(
    <ConnectionGag phase="tracking" onReconnect={() => {}} />,
  );
  expect(container.querySelector(".vhs")!.classList.contains("still")).toBe(
    true,
  );
});
