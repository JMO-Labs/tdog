import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { Resolved } from "../presets/api";
import { fontFamily, loadFont } from "../theme/fonts";
import { findTheme } from "../theme/registry";
import { themeStore } from "../theme/store";
import type { TerminalPreset } from "./terminalToml";

type Props = { draft: TerminalPreset; resolved: Resolved };

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

/** Sample screen: a prompt line and the 16 ANSI colours. No shell attached. */
function sample(): string {
  const row = (base: number) =>
    Array.from({ length: 8 }, (_, i) => `\x1b[${base + i}m  \x1b[0m`).join("");
  return [
    "\x1b[32mdev@tdog\x1b[0m:\x1b[34m~/src\x1b[0m$ ls --color",
    "\x1b[34mcmd\x1b[0m  \x1b[34minternal\x1b[0m  \x1b[34mweb\x1b[0m  README.md",
    "\x1b[32mdev@tdog\x1b[0m:\x1b[34m~/src\x1b[0m$ ",
    "",
    row(40),
    row(100),
  ].join("\r\n");
}

/** Live xterm showing the draft's look; updates synchronously with the draft. */
export function TerminalPreview({ draft, resolved }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);

  const themeId = draft.theme || str(resolved.theme?.value);
  const scope = themeStore.scope(themeId);
  const family =
    str(draft.font?.family) ??
    str(resolved["font.family"]?.value) ??
    fontFamily(scope.font);
  const size = draft.font?.size ?? num(resolved["font.size"]?.value) ?? 14;
  const opacity =
    draft.background?.opacity ??
    num(resolved["background.opacity"]?.value) ??
    1;
  const palette = themeStore.terminal(themeId);
  const kind =
    draft.background?.kind ?? str(resolved["background.kind"]?.value);
  const ref = draft.background?.ref ?? str(resolved["background.ref"]?.value);
  const paint = kind === "color" && ref ? ref : palette.background;

  const options = {
    fontFamily: family,
    fontSize: size,
    cursorStyle: scope.cursor.shape,
    cursorBlink: scope.cursor.blink,
    theme: { ...palette, background: "#00000000" },
  };
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const t = new Terminal({
      ...latest.current,
      allowTransparency: true,
      cols: 40,
      rows: 8,
      disableStdin: true,
    });
    t.open(host.current!);
    t.write(sample());
    term.current = t;
    return () => {
      t.dispose();
      term.current = null;
    };
  }, []);

  // Same-render updates: xterm repaints on the next frame.
  useEffect(() => {
    const t = term.current;
    if (!t) return;
    Object.assign(t.options, latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, size, scope.cursor.shape, scope.cursor.blink, themeId]);

  useEffect(() => {
    const id = findTheme(themeId)?.terminal.font;
    if (id) void loadFont(id);
  }, [themeId]);

  return (
    <div className="td-preview" aria-label="Preview">
      <div
        data-testid="preview-bg"
        className="td-preview-bg"
        style={{ background: paint, opacity }}
      />
      <div ref={host} className="td-preview-term" />
    </div>
  );
}
