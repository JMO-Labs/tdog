import { render, screen, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import * as api from "../presets/api";
import { setScenePreset } from "../presets/panes";
import { SceneBackground, SceneBgContext } from "./SceneBackground";

beforeEach(() => localStorage.clear());

function Probe() {
  return <i data-testid="probe">{String(useContext(SceneBgContext))}</i>;
}

test("draws the scene layer and tells panes to be see-through", async () => {
  setScenePreset("t1", "dev");
  vi.spyOn(api, "resolveScene").mockResolvedValue({
    "background.kind": { value: "color", origin: "scene" },
    "background.ref": { value: "#123456", origin: "scene" },
    "background.opacity": { value: 0.8, origin: "scene" },
  });
  render(
    <SceneBackground scene="t1">
      <Probe />
    </SceneBackground>,
  );
  await waitFor(() => screen.getByTestId("bg-layer"));
  expect(screen.getByTestId("probe").textContent).toBe("true");
  expect(screen.getByTestId("bg-layer").style.opacity).toBe("0.8");
  expect(screen.getByTestId("bg-layer").hasAttribute("data-scene-bg")).toBe(
    true,
  );
});

test("a scene without a preset has no layer", () => {
  const spy = vi.spyOn(api, "resolveScene");
  render(
    <SceneBackground scene="plain">
      <Probe />
    </SceneBackground>,
  );
  expect(screen.queryByTestId("bg-layer")).toBeNull();
  expect(screen.getByTestId("probe").textContent).toBe("false");
  expect(spy).not.toHaveBeenCalled();
});

test("a failed resolve leaves the scene plain", async () => {
  setScenePreset("t2", "bad");
  const spy = vi.spyOn(api, "resolveScene").mockRejectedValue(new Error("x"));
  render(<SceneBackground scene="t2">x</SceneBackground>);
  await waitFor(() => expect(spy).toHaveBeenCalled());
  expect(screen.queryByTestId("bg-layer")).toBeNull();
});
