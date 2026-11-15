import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPaneInput,
  unregisterPaneInput,
  getScenePanes,
  __clearAllEntries,
} from "./sessionRegistry";

describe("broadcast session registry", () => {
  beforeEach(() => {
    __clearAllEntries();
  });

  it("registers pane input handlers", () => {
    const scene = "scene1";
    const pane = "pane1";
    let called = false;

    const send = () => {
      called = true;
    };

    registerPaneInput(scene, pane, send);
    const panes = getScenePanes(scene);

    expect(panes).toHaveProperty(pane);
    panes[pane].send(new Uint8Array([1, 2, 3]));
    expect(called).toBe(true);
  });

  it("unregisters pane input", () => {
    const scene = "scene1";

    registerPaneInput(scene, "pane1", () => {});
    registerPaneInput(scene, "pane2", () => {});

    unregisterPaneInput(scene, "pane1");

    const panes = getScenePanes(scene);
    expect(panes).not.toHaveProperty("pane1");
    expect(panes).toHaveProperty("pane2");
  });

  it("removes scene when all panes are unregistered", () => {
    const scene = "scene1";

    registerPaneInput(scene, "pane1", () => {});
    unregisterPaneInput(scene, "pane1");

    const panes = getScenePanes(scene);
    expect(Object.keys(panes).length).toBe(0);
  });

  it("maintains separate panes per scene", () => {
    registerPaneInput("scene1", "pane1", () => {});
    registerPaneInput("scene2", "pane1", () => {});

    const panes1 = getScenePanes("scene1");
    const panes2 = getScenePanes("scene2");

    expect(Object.keys(panes1).length).toBe(1);
    expect(Object.keys(panes2).length).toBe(1);
  });

  it("allows multiple input handlers in same scene", () => {
    const scene = "scene1";
    const results: string[] = [];

    registerPaneInput(scene, "pane1", (data) => {
      results.push(`pane1: ${data.length}`);
    });
    registerPaneInput(scene, "pane2", (data) => {
      results.push(`pane2: ${data.length}`);
    });

    const panes = getScenePanes(scene);
    panes["pane1"].send(new Uint8Array([1, 2]));
    panes["pane2"].send(new Uint8Array([1, 2, 3]));

    expect(results).toEqual(["pane1: 2", "pane2: 3"]);
  });
});
