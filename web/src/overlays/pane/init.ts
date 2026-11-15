/** Initialize built-in pane overlays. */
import { registerPaneOverlay } from "./registry";
import { showScreenOverlay } from "./ShowScreen";

export function initPaneOverlays() {
  registerPaneOverlay({
    id: "show-screen",
    title: "Show screen text",
    render: showScreenOverlay,
  });
}
