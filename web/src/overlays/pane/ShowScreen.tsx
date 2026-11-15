import { Button } from "../../components/ui/button";
import type { PaneOverlayContext } from "../../terminal/renderer";
import type { PaneOverlayRender } from "./registry";

/** Screen text display component. */
function ShowScreenContent({ ctx }: { ctx: PaneOverlayContext }) {
  const text = ctx.screen.map((line) => line.text).join("\n");

  return (
    <div className="overlay-card">
      <h2>Screen text</h2>
      <div className="overlay-text-area">
        <pre>{text}</pre>
      </div>
      <div className="overlay-actions">
        <Button
          onClick={() => ctx.insert(text)}
          aria-label="Insert screen text into terminal"
        >
          Insert
        </Button>
        <Button
          onClick={() => ctx.copy(text)}
          aria-label="Copy screen text to clipboard"
        >
          Copy
        </Button>
        <Button onClick={() => ctx.close()} aria-label="Close screen overlay">
          Close
        </Button>
      </div>
    </div>
  );
}

/** Demo overlay showing the visible screen text with insert and copy actions. */
export const showScreenOverlay: PaneOverlayRender = (
  ctx: PaneOverlayContext,
) => <ShowScreenContent ctx={ctx} />;
