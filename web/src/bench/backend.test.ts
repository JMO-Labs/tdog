import { describe, expect, it } from "vitest";
import { detectBackend } from "./backend";

const canvas = (webgl2: boolean) => () =>
  ({ getContext: (k: string) => (k === "webgl2" && webgl2 ? {} : null) }) as unknown as HTMLCanvasElement;

describe("detectBackend", () => {
  it("WebGPU when an adapter is granted", async () => {
    const gpu = { requestAdapter: async () => ({}) };
    expect(await detectBackend({ gpu }, canvas(true))).toBe("WebGPU");
  });
  it("falls back to WebGL2 when no adapter", async () => {
    const gpu = { requestAdapter: async () => null };
    expect(await detectBackend({ gpu }, canvas(true))).toBe("WebGL2");
  });
  it("falls back to WebGL2 when requestAdapter throws", async () => {
    const gpu = {
      requestAdapter: async () => {
        throw new Error("x");
      },
    };
    expect(await detectBackend({ gpu }, canvas(true))).toBe("WebGL2");
  });
  it("none when neither is available", async () => {
    expect(await detectBackend({}, canvas(false))).toBe("none");
  });
});
