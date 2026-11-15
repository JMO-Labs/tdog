/** Initialize built-in pane overlays and commands. */
import { registerCommand } from "../commands";
import { registerPaneOverlay } from "./registry";
import { openFocusedPaneOverlay } from "./focusedPane";
import { showScreenOverlay } from "./ShowScreen";
import { unicodeInputOverlay } from "./unicode/index";

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
}
