/**
 * Filter terminal report sequences from broadcast.
 * The xterm emulator generates responses for queries (cursor position, device attributes, etc.)
 * and terminal events (focus in/out, mouse reports). These must NOT be broadcast, as they could
 * be exploited to inject terminal control sequences into other panes.
 *
 * Only user input (typing, navigation, paste) is broadcast.
 */

const terminalReportPatterns = [
  // Cursor position report: CSI Ps ; Ps R
  /\x1b\[\d+;\d+R/,
  // Device attributes: CSI ? ... c or CSI > ... c
  /\x1b\[\?[^c]*c/,
  /\x1b\[[>][^c]*c/,
  // Focus in/out: CSI I or CSI O
  /\x1b\[I/,
  /\x1b\[O/,
  // Mouse reports: CSI M ... (X11 protocol) or CSI < ... M/m (SGR protocol)
  /\x1b\[M/,
  /\x1b\[<[^m]*[Mm]/,
  // OSC replies: OSC ... (BEL | ST)
  /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/,
  // DCS replies: DCS ... ST
  /\x1bP[^\x1b]*\x1b\\/,
];

/**
 * Check if data is a terminal report (should not be broadcast).
 * Returns true if data appears to be a terminal-generated response rather than user input.
 */
export function isTerminalReport(data: Uint8Array | string): boolean {
  const str = typeof data === "string" ? data : new TextDecoder().decode(data);

  // Empty data or single byte control characters are likely user input
  if (str.length === 0) return false;

  // Bracketed paste should be broadcast (it's user input)
  // ESC[200~ ... ESC[201~
  if (str.includes("\x1b[200~")) return false;
  if (str.includes("\x1b[201~")) return false;

  // Check if matches any terminal report pattern
  for (const pattern of terminalReportPatterns) {
    if (pattern.test(str)) return true;
  }

  return false;
}

/**
 * Filter out terminal report sequences, keeping only user input.
 * Returns the input if it's user input, or empty bytes if it's a terminal report.
 */
export function filterTerminalReports(data: Uint8Array): Uint8Array {
  if (isTerminalReport(data)) {
    return new Uint8Array(0);
  }
  return data;
}
