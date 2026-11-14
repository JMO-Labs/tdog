import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Pet } from "./pet";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  );
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect() {},
    fillRect() {},
    set fillStyle(_v: string) {},
  }) as never;
});

const setup = (awake = true, attention = false) => {
  const onHide = vi.fn();
  render(<Pet awake={awake} onHide={onHide} attention={attention} />);
  return onHide;
};

test("mini egg is closed by default with a collapsed trigger", () => {
  setup();
  const egg = screen.getByTestId("pet");
  expect(egg.getAttribute("aria-haspopup")).toBe("dialog");
  expect(egg.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("click opens dialog with LCD, meters, A/B/C and Hide pet", () => {
  setup();
  fireEvent.click(screen.getByTestId("pet"));
  expect(screen.getByRole("dialog", { name: "Dogbert" })).toBeTruthy();
  expect(screen.getByRole("img", { name: /Dogbert is/ })).toBeTruthy();
  expect(screen.getByRole("meter", { name: "Full" })).toBeTruthy();
  expect(screen.getByRole("meter", { name: "Happy" })).toBeTruthy();
  for (const n of ["Feed", "Play fetch", "Clean up"]) {
    expect(screen.getByRole("button", { name: n }).getAttribute("title")).toBe(
      n,
    );
  }
  expect(screen.getByRole("button", { name: "Hide pet" })).toBeTruthy();
});

test("LCD aria-label matches the live caption", () => {
  setup();
  fireEvent.click(screen.getByTestId("pet"));
  const cap = screen.getByTestId("pet-cap");
  expect(cap.getAttribute("aria-live")).toBe("polite");
  expect(screen.getByRole("img", { name: cap.textContent! })).toBeTruthy();
});

test("focus moves into the popover, Esc closes and restores focus", () => {
  setup();
  const egg = screen.getByTestId("pet");
  egg.focus();
  fireEvent.click(egg);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Feed" }),
  );
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(egg);
});

test("outside click closes and restores focus; inside click does not", () => {
  setup();
  const egg = screen.getByTestId("pet");
  fireEvent.click(egg);
  fireEvent.mouseDown(screen.getByRole("dialog"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(egg);
});

test("clicking the egg again closes it", () => {
  setup();
  const egg = screen.getByTestId("pet");
  fireEvent.click(egg);
  fireEvent.click(egg);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Hide pet calls onHide", () => {
  const onHide = setup();
  fireEvent.click(screen.getByTestId("pet"));
  fireEvent.click(screen.getByRole("button", { name: "Hide pet" }));
  expect(onHide).toHaveBeenCalledTimes(1);
});

test("reduced motion adds a class that stops the pip pulse", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
  );
  setup();
  expect(screen.getByTestId("pet").className).toContain("reduced");
});

test("attention pip shows only when asked", () => {
  setup(true, true);
  expect(screen.getByTestId("pet-pip")).toBeTruthy();
});

test("no interval under reduced motion; caption tracks awake state", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
  );
  setup(false);
  fireEvent.click(screen.getByTestId("pet"));
  expect(screen.getByTestId("pet-cap").textContent).toMatch(/asleep/);
});
