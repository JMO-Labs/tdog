import type { PaneOverlayContext } from "../../../terminal/renderer";
import type { PaneOverlayRender } from "../registry";
import type { Match } from "./matchers";
import { Hints } from "./Hints";

export interface HintsOverlayOptions {
  matchTypes?: Match["type"][];
  defaultAction?: "open" | "copy" | "insert";
}

export function createHintsOverlay(
  options: HintsOverlayOptions = {},
): PaneOverlayRender {
  return (ctx: PaneOverlayContext) => (
    <HintsContent ctx={ctx} options={options} />
  );
}

function HintsContent({
  ctx,
  options,
}: {
  ctx: PaneOverlayContext;
  options: HintsOverlayOptions;
}) {
  const handleSelect = (text: string, insert: boolean) => {
    if (insert) {
      ctx.insert(text);
    } else {
      const action = options.defaultAction ?? getDefaultAction(text);
      if (action === "open") {
        ctx.open(text);
      } else if (action === "copy") {
        ctx.copy(text);
      } else if (action === "insert") {
        ctx.insert(text);
      }
    }
  };

  return (
    <Hints
      ctx={ctx}
      matchTypes={options.matchTypes}
      onSelect={handleSelect}
      onEscape={() => ctx.close()}
    />
  );
}

function getDefaultAction(text: string): "open" | "copy" | "insert" {
  // URLs open
  if (text.startsWith("http://") || text.startsWith("https://")) {
    return "open";
  }
  // Everything else copies
  return "copy";
}

/** Main hints overlay for all types (URL, path, hash, IP, email, word). */
export const hintsOverlay: PaneOverlayRender = createHintsOverlay();

/** Hints overlay: only URLs. */
export const hintsOpenUrlOverlay: PaneOverlayRender = createHintsOverlay({
  matchTypes: ["url"],
  defaultAction: "open",
});

/** Hints overlay: only paths. */
export const hintsCopyPathOverlay: PaneOverlayRender = createHintsOverlay({
  matchTypes: ["path"],
  defaultAction: "copy",
});

/** Hints overlay: only hashes. */
export const hintsCopyHashOverlay: PaneOverlayRender = createHintsOverlay({
  matchTypes: ["hash"],
  defaultAction: "copy",
});

/** Hints overlay: only words (for insert). */
export const hintsInsertWordOverlay: PaneOverlayRender = createHintsOverlay({
  matchTypes: ["word"],
  defaultAction: "insert",
});
