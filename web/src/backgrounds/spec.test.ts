import { describe, expect, test } from "vitest";
import { assetUrl, bgSpec, layerCss, shouldPlay } from "./spec";

const r = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).map(([k, value]) => [k, { value, origin: "terminal" }]),
  );

describe("bgSpec", () => {
  test("none or missing kind yields no layer", () => {
    expect(bgSpec({})).toBeNull();
    expect(bgSpec(r({ "background.kind": "none" }))).toBeNull();
  });
  test("reads kind, ref, opacity and blur with defaults", () => {
    expect(
      bgSpec(r({ "background.kind": "image", "background.ref": "ab12" })),
    ).toEqual({ kind: "image", ref: "ab12", opacity: 1, blur: 0 });
    expect(
      bgSpec(
        r({
          "background.kind": "video",
          "background.ref": "v1",
          "background.opacity": 0.4,
          "background.blur": 6,
        }),
      ),
    ).toEqual({ kind: "video", ref: "v1", opacity: 0.4, blur: 6 });
  });
  test("clamps opacity and blur", () => {
    const s = bgSpec(
      r({
        "background.kind": "color",
        "background.ref": "#fff",
        "background.opacity": 3,
        "background.blur": -2,
      }),
    );
    expect(s).toMatchObject({ opacity: 1, blur: 0 });
  });
  test("shader is not drawn here", () => {
    expect(
      bgSpec(r({ "background.kind": "shader", "background.ref": "vhs" })),
    ).toBeNull();
  });
});

describe("layerCss", () => {
  const base = { opacity: 0.5, blur: 4 };
  test("color accepts safe values only", () => {
    expect(layerCss({ kind: "color", ref: "#112233", ...base })).toMatchObject({
      background: "#112233",
    });
    expect(layerCss({ kind: "color", ref: "red;x:y", ...base })).toBeNull();
  });
  test("gradient is passed as background-image", () => {
    const g = "linear-gradient(#000, #fff)";
    expect(layerCss({ kind: "gradient", ref: g, ...base })).toMatchObject({
      backgroundImage: g,
    });
    expect(
      layerCss({ kind: "gradient", ref: "url(http://x)", ...base }),
    ).toBeNull();
  });
  test("image and gif use the asset url", () => {
    expect(layerCss({ kind: "image", ref: "ab12", ...base })).toMatchObject({
      backgroundImage: `url("/api/assets/ab12")`,
    });
    expect(assetUrl("a/b")).toBe("/api/assets/a%2Fb");
  });
  test("pattern maps built-in ids; unknown yields none", () => {
    expect(layerCss({ kind: "pattern", ref: "dots", ...base })).not.toBeNull();
    expect(layerCss({ kind: "pattern", ref: "nope", ...base })).toBeNull();
  });
  test("opacity and blur apply", () => {
    const c = layerCss({ kind: "color", ref: "#000", ...base });
    expect(c).toMatchObject({ opacity: 0.5, filter: "blur(4px)" });
    expect(
      layerCss({ kind: "color", ref: "#000", opacity: 1, blur: 0 })?.filter,
    ).toBeUndefined();
  });
  test("video has no css layer", () => {
    expect(layerCss({ kind: "video", ref: "v", ...base })).toBeNull();
  });
});

describe("shouldPlay", () => {
  test("plays only when page visible, on screen and not in performance mode", () => {
    expect(shouldPlay({ pageVisible: true, onScreen: true, perf: false })).toBe(
      true,
    );
    expect(
      shouldPlay({ pageVisible: false, onScreen: true, perf: false }),
    ).toBe(false);
    expect(
      shouldPlay({ pageVisible: true, onScreen: false, perf: false }),
    ).toBe(false);
    expect(shouldPlay({ pageVisible: true, onScreen: true, perf: true })).toBe(
      false,
    );
  });
});
