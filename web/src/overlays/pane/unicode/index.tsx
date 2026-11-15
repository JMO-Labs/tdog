import { lazy, Suspense } from "react";
import type { PaneOverlayRender } from "../registry";
import type { PaneOverlayContext } from "../../../terminal/renderer";

const UnicodeInputAsync = lazy(async () => {
  const [{ UnicodeInput }, { unicodeData }] = await Promise.all([
    import("./UnicodeInput"),
    import("./data"),
  ]);
  return {
    default: ({ ctx }: { ctx: PaneOverlayContext }) => (
      <UnicodeInput ctx={ctx} data={unicodeData} />
    ),
  };
});

/** Unicode input overlay renderer (lazily loaded). */
export const unicodeInputOverlay: PaneOverlayRender = (ctx) => (
  <Suspense fallback={<div style={{ padding: "16px" }}>Loading...</div>}>
    <UnicodeInputAsync ctx={ctx} />
  </Suspense>
);
