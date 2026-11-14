import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { EffectsOverlay } from "./EffectsOverlay";
import { resetFxCache, setFx } from "./store";
import { DEFAULT_FX } from "./resolve";

beforeEach(() => {
  localStorage.clear();
  resetFxCache();
  setFx(DEFAULT_FX);
});

test("renders nothing without effects or with master off", () => {
  const { container } = render(<EffectsOverlay effects={[]} />);
  expect(container.firstChild).toBeNull();
  setFx({ ...DEFAULT_FX, master: false });
  render(<EffectsOverlay effects={[{ id: "scanlines", intensity: 1 }]} />);
  expect(screen.queryByTestId("fx-root")).toBeNull();
});

test("draws enabled effects as inert layers", () => {
  const { container } = render(
    <EffectsOverlay
      effects={[
        { id: "scanlines", intensity: 1 },
        { id: "vignette", intensity: 0.5 },
      ]}
    />,
  );
  expect(container.querySelectorAll("[data-fx]").length).toBe(2);
  expect(screen.getByTestId("fx-root").getAttribute("aria-hidden")).toBe(
    "true",
  );
});

test("force bypasses settings and renders every listed effect", () => {
  setFx({ ...DEFAULT_FX, master: false });
  const { container } = render(
    <EffectsOverlay
      force
      effects={[
        { id: "flicker", intensity: 1 },
        { id: "tracking", intensity: 1 },
      ]}
    />,
  );
  expect(container.querySelectorAll("[data-fx]").length).toBe(2);
});

test("layers split: glyph-rain is behind, the rest in front", () => {
  const effects = [
    { id: "glyph-rain" as const, intensity: 1 },
    { id: "scanlines" as const, intensity: 1 },
  ];
  const back = render(<EffectsOverlay layer="behind" effects={effects} />);
  expect(back.container.querySelector(".fx-glyph-rain")).not.toBeNull();
  expect(back.container.querySelector("[data-fx]")).toBeNull();
  expect(
    back.container.querySelector(".fx-root")?.classList.contains("fx-behind"),
  ).toBe(true);
  back.unmount();
  const front = render(<EffectsOverlay layer="front" effects={effects} />);
  expect(front.container.querySelector(".fx-glyph-rain")).toBeNull();
  expect(front.container.querySelectorAll("[data-fx]").length).toBe(1);
});
