/** Swappable terminal renderer (ADR-0001). */
export interface TerminalTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
}

export interface TerminalRenderer {
  /** Write bytes; `cb` fires once the renderer has processed them (flow control). */
  write(data: Uint8Array, cb?: () => void): void;
  /** Refit to the container; fires onResize if the grid changed. */
  resize(): void;
  size(): { cols: number; rows: number };
  onInput(cb: (data: Uint8Array) => void): void;
  onResize(cb: (cols: number, rows: number) => void): void;
  setTheme(theme: TerminalTheme): void;
  dispose(): void;
}
