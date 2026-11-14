export type Backend = "WebGPU" | "WebGL2" | "none";

interface GpuLike {
  requestAdapter(): Promise<unknown>;
}

/**
 * Which GPU backend restty can get, probed in its preference order
 * (WebGPU, then WebGL2). restty's xterm-compat API does not expose the
 * backend it picked, so we probe the same capabilities it needs.
 */
export async function detectBackend(
  nav: { gpu?: GpuLike } = navigator as unknown as { gpu?: GpuLike },
  makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): Promise<Backend> {
  try {
    if (nav.gpu && (await nav.gpu.requestAdapter())) return "WebGPU";
  } catch {
    // fall through to WebGL2
  }
  return makeCanvas().getContext("webgl2") ? "WebGL2" : "none";
}
