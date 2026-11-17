import type { Spacing } from "../theme/fonts";
/** Swappable terminal renderer (ADR-0001). */
export interface TerminalTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
  selectionBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface CursorStyle {
  shape: "block" | "bar" | "underline";
  blink: boolean;
}

export interface ScreenLine {
  row: number;
  text: string;
}

export interface CellGeometry {
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
}

export interface PaneOverlayContext {
  screen: ScreenLine[];
  cellGeometry: CellGeometry;
  insert(text: string): void;
  copy(text: string): void;
  open(url: string): void;
  close(): void;
  sessionId?: string;
  cwd?: string;
}

/** A buffer line that follows its content as the terminal scrolls. */
export interface PaneMarker {
  line: number;
  isDisposed: boolean;
  dispose(): void;
}

export interface TerminalRenderer {
  /** Write bytes; `cb` fires once the renderer has processed them (flow control). */
  write(data: Uint8Array, cb?: () => void): void;
  /** Refit to the container; fires onResize if the grid changed. */
  resize(): void;
  size(): { cols: number; rows: number };
  onInput(cb: (data: Uint8Array) => void): void;
  onResize(cb: (cols: number, rows: number) => void): void;
  /** Shell title changes (OSC 0/2). Optional: renderers may not support it. */
  onTitle?(cb: (title: string) => void): void;
  /** Shell cwd reports (OSC 7), already decoded to a path. */
  onCwd?(cb: (cwd: string) => void): void;
  setTheme(theme: TerminalTheme): void;
  setCursor(c: CursorStyle): void;
  /** Set font family and/or size, then refit. Unset values keep the current one. */
  setFont?(family?: string, size?: number, spacing?: Spacing): void;
  /** Zoom steps (1px each) on top of the font size; 0 = none. */
  setZoom?(steps: number): void;
  /** Selected text, or "" when nothing is selected. */
  getSelection?(): string;
  selectAll?(): void;
  /** Send text as a paste (bracketed when the app asked for it). */
  paste?(text: string): void;
  focus?(): void;
  /** Viewport x/y just below the cursor cell, or null when unknown. */
  cursorRect?(): { x: number; y: number } | null;
  /** True while the running app has asked for mouse events (vim, htop). */
  mouseReporting?(): boolean;
  /** Visible screen lines with row numbers from the viewport. Optional: for overlays. */
  screenLines?(): ScreenLine[];
  /** Text of the cursor's logical line (wrapped rows joined), prompt included. */
  cursorLine?(): string;
  /** Cell geometry: dimensions and offsets for layout. Optional: for overlays. */
  cellGeometry?(): CellGeometry | null;
  /** Enable/disable inline images (sixel/iTerm2). Optional: renderers may not support it. */
  setInlineImages?(enabled: boolean): void;
  /** Marker at the cursor's line, or null when unsupported/unavailable. */
  markLine?(): PaneMarker | null;
  /** Scroll a marker's line into view and briefly highlight it. */
  scrollToMarker?(m: PaneMarker): void;
  dispose(): void;
}
