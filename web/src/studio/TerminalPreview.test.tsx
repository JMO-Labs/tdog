import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({ terms: [] as any[] }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    options: any;
    write = vi.fn();
    open = vi.fn();
    dispose = vi.fn();
    resize = vi.fn();
    constructor(o: any) {
      this.options = { ...o };
      m.terms.push(this);
    }
  },
}));

import { TerminalPreview } from "./TerminalPreview";
import { themeStore } from "../theme/store";

afterEach(() => {
  cleanup();
  m.terms.length = 0;
});

test("renders a real terminal with the draft's theme, font and size", () => {
  render(
    <TerminalPreview
      draft={{ theme: "night-market", font: { size: 18 } }}
      resolved={{}}
    />,
  );
  const t = m.terms[0];
  expect(t.write).toHaveBeenCalled();
  expect(t.options.fontSize).toBe(18);
  expect(t.options.theme.foreground).toBe(
    themeStore.terminal("night-market").foreground,
  );
});

test("updates the same terminal synchronously on change", () => {
  const { rerender } = render(
    <TerminalPreview draft={{ font: { size: 12 } }} resolved={{}} />,
  );
  rerender(<TerminalPreview draft={{ font: { size: 20 } }} resolved={{}} />);
  expect(m.terms).toHaveLength(1);
  expect(m.terms[0].options.fontSize).toBe(20);
});

test("falls back to resolved values and applies background opacity", () => {
  render(
    <TerminalPreview
      draft={{ background: { opacity: 0.4 } }}
      resolved={{
        theme: { value: "night-market", origin: "global" },
        "font.size": { value: 15, origin: "global" },
      }}
    />,
  );
  expect(m.terms[0].options.fontSize).toBe(15);
  const bg = screen.getByTestId("preview-bg");
  expect(bg.style.opacity).toBe("0.4");
});
