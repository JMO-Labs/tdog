/** Initialize built-in pane overlays and commands. */
import { registerCommand } from "../commands";
import { registerPaneOverlay } from "./registry";
import { openFocusedPaneOverlay } from "./focusedPane";
import { showScreenOverlay } from "./ShowScreen";
import { unicodeInputOverlay } from "./unicode/index";
import {
  hintsOverlay,
  hintsOpenUrlOverlay,
  hintsCopyPathOverlay,
  hintsCopyHashOverlay,
  hintsInsertWordOverlay,
} from "./hints/HintsOverlay";
import { DiffOverlay } from "./diff/DiffOverlay";

export function initPaneOverlays() {
  registerPaneOverlay({
    id: "show-screen",
    title: "Show screen text",
    render: showScreenOverlay,
  });

  registerCommand({
    id: "overlay.show-screen",
    title: "Show screen text",
    group: "Overlays",
    run: () => {
      openFocusedPaneOverlay("show-screen");
    },
  });

  registerPaneOverlay({
    id: "insert-unicode",
    title: "Insert unicode character",
    render: unicodeInputOverlay,
  });

  registerCommand({
    id: "overlay.insert-unicode",
    title: "Insert unicode character",
    shortcut: "⌘⌃Space",
    group: "Overlays",
    run: () => {
      openFocusedPaneOverlay("insert-unicode");
    },
  });

  // Hints overlays
  registerPaneOverlay({
    id: "hints",
    title: "Hints",
    render: hintsOverlay,
  });

  registerPaneOverlay({
    id: "hints-open-url",
    title: "Hints: open URL",
    render: hintsOpenUrlOverlay,
  });

  registerPaneOverlay({
    id: "hints-copy-path",
    title: "Hints: copy path",
    render: hintsCopyPathOverlay,
  });

  registerPaneOverlay({
    id: "hints-copy-hash",
    title: "Hints: copy hash",
    render: hintsCopyHashOverlay,
  });

  registerPaneOverlay({
    id: "hints-insert-word",
    title: "Hints: insert word",
    render: hintsInsertWordOverlay,
  });

  // Hints commands
  registerCommand({
    id: "overlay.hints",
    title: "Hints",
    shortcut: "⌘⇧E",
    group: "Hints",
    run: () => {
      openFocusedPaneOverlay("hints");
    },
  });

  registerCommand({
    id: "overlay.hints-open-url",
    title: "Hints: open URL",
    group: "Hints",
    run: () => {
      openFocusedPaneOverlay("hints-open-url");
    },
  });

  registerCommand({
    id: "overlay.hints-copy-path",
    title: "Hints: copy path",
    group: "Hints",
    run: () => {
      openFocusedPaneOverlay("hints-copy-path");
    },
  });

  registerCommand({
    id: "overlay.hints-copy-hash",
    title: "Hints: copy hash",
    group: "Hints",
    run: () => {
      openFocusedPaneOverlay("hints-copy-hash");
    },
  });

  registerCommand({
    id: "overlay.hints-insert-word",
    title: "Hints: insert word",
    group: "Hints",
    run: () => {
      openFocusedPaneOverlay("hints-insert-word");
    },
  });

  // Diff overlay
  registerPaneOverlay({
    id: "diff",
    title: "Diff two files",
    render: DiffOverlay,
  });

  registerCommand({
    id: "overlay.diff",
    title: "Diff two files…",
    shortcut: "⌘K",
    group: "Overlays",
    run: () => {
      openFocusedPaneOverlay("diff");
    },
  });
}
