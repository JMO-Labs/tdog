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
  expect(screen.getByTestId("fx-root").getAttribute("aria-hidden")).toBe("true");
});
