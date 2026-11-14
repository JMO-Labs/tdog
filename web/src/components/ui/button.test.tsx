import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Button, IconButton } from "./button";

test("button variants map to mockup classes", () => {
  render(
    <>
      <Button variant="primary">P</Button>
      <Button variant="danger">D</Button>
      <Button variant="ghost" size="sm">
        G
      </Button>
    </>,
  );
  expect(screen.getByText("P").className).toContain("primary");
  expect(screen.getByText("D").className).toContain("danger");
  const g = screen.getByText("G");
  expect(g.className).toContain("ghost");
  expect(g.className).toContain("sm");
});

test("button is type=button and fires onClick; disabled does not", () => {
  const fn = vi.fn();
  const { rerender } = render(<Button onClick={fn}>Go</Button>);
  const b = screen.getByRole("button", { name: "Go" });
  expect(b.getAttribute("type")).toBe("button");
  fireEvent.click(b);
  expect(fn).toHaveBeenCalledTimes(1);
  rerender(
    <Button onClick={fn} disabled>
      Go
    </Button>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Go" }));
  expect(fn).toHaveBeenCalledTimes(1);
});

test("icon button needs a label and supports sm", () => {
  render(
    <IconButton label="Close" size="sm">
      x
    </IconButton>,
  );
  const b = screen.getByRole("button", { name: "Close" });
  expect(b.className).toContain("icon-btn");
  expect(b.className).toContain("sm");
});

test("icon button shows a styled tooltip after 400 ms, no native title", () => {
  vi.useFakeTimers();
  render(
    <IconButton label="Close" shortcut="Esc">
      x
    </IconButton>,
  );
  const b = screen.getByRole("button", { name: "Close" });
  expect(b.getAttribute("title")).toBeNull();
  fireEvent.mouseEnter(b);
  expect(screen.queryByRole("tooltip")).toBeNull();
  act(() => void vi.advanceTimersByTime(400));
  expect(screen.getByRole("tooltip").textContent).toContain("Close");
  vi.useRealTimers();
});
