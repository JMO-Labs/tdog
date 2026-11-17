import { expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ pending: {} as Record<string, () => void> }));

vi.mock("./theme/serverFonts", () => ({
  whenFamilyReady: (f: string) =>
    new Promise<void>((res) => (h.pending[f] = res)),
}));

import { applyFont } from "./TerminalPane";

const res = (family: string) =>
  ({
    "font.family": { value: family, origin: "terminal" },
    "font.size": { value: 14, origin: "terminal" },
  }) as never;

test("a late-loading earlier family never overrides the current one", async () => {
  const setFont = vi.fn();
  const r = { setFont } as never;
  applyFont(r, res("A"));
  applyFont(r, res("B"));
  h.pending.B();
  await Promise.resolve();
  await Promise.resolve();
  h.pending.A();
  await Promise.resolve();
  await Promise.resolve();
  expect(setFont.mock.calls.at(-1)).toEqual([
    "B",
    14,
    { letterSpacing: 0, lineHeight: 1 },
  ]);
  expect(setFont.mock.calls.filter((c) => c[0] === "A")).toHaveLength(1);
});
