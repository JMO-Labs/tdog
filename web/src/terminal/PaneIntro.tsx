import { useEffect, useState } from "react";
import { Scene } from "../auth/Boot";
import { bootFor, type BootId } from "../auth/boot";
import { prefersReducedMotion } from "../motion/reducedMotion";
import { usePref } from "../settings/prefs";
import { themeStore } from "../theme/store";
import "./paneIntro.css";

/** Longest the intro stays mounted, ms (CSS fades it out from 600 ms). */
export const PANE_INTRO_MS = 800;

/** Compact, click-through version of the theme's boot scene, played once. */
export function PaneIntro({ theme }: { theme?: string }) {
  const [serious] = usePref("serious");
  const [perf] = usePref("perf");
  const [boot] = usePref("boot");
  // Decided once at mount: reconnects and theme changes never replay it.
  const [variant, setVariant] = useState<Exclude<BootId, "drop"> | null>(() => {
    if (serious || perf || !boot || prefersReducedMotion()) return null;
    const v = bootFor(theme ?? themeStore.get().id, false);
    return v === "drop" || v === "fade" ? null : v;
  });
  useEffect(() => {
    if (!variant) return;
    const t = setTimeout(() => setVariant(null), PANE_INTRO_MS);
    return () => clearTimeout(t);
  }, [variant]);
  if (!variant) return null;
  return (
    <div
      className="boot pane-intro"
      data-testid="pane-intro"
      data-boot={variant}
      aria-hidden="true"
    >
      <Scene v={variant} />
    </div>
  );
}
