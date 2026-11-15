import type { PaneOverlayContext } from "../../terminal/renderer";
import type { PaneOverlayRender } from "./registry";

/** Demo overlay showing the visible screen text with insert and copy actions. */
export const showScreenOverlay: PaneOverlayRender = (
  ctx: PaneOverlayContext,
) => {
  // Get the overlay container from the parent
  const overlayContainer = (globalThis as any).__paneOverlayContainer as
    HTMLElement | undefined;
  if (!overlayContainer) return;

  const card = document.createElement("div");
  card.className = "overlay-card";

  const title = document.createElement("h2");
  title.textContent = "Screen text";

  const textArea = document.createElement("div");
  textArea.className = "overlay-text-area";
  const pre = document.createElement("pre");
  const text = ctx.screen.map((line: { text: string }) => line.text).join("\n");
  pre.textContent = text;
  textArea.appendChild(pre);

  const actions = document.createElement("div");
  actions.className = "overlay-actions";

  const insertBtn = document.createElement("button");
  insertBtn.textContent = "Insert";
  insertBtn.addEventListener("click", () => ctx.insert(text));

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => ctx.copy(text));

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => ctx.close());

  actions.appendChild(insertBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(closeBtn);

  card.appendChild(title);
  card.appendChild(textArea);
  card.appendChild(actions);

  overlayContainer.appendChild(card);

  // Focus the first button
  insertBtn.focus();
};
