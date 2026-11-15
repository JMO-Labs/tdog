import { useEffect, useRef, useState } from "react";
import { usePageVisible } from "../effects/store";
import { usePref } from "../settings/prefs";
import { assetUrl, finish, layerCss, shouldPlay, type BgSpec } from "./spec";

const FILL = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
} as const;

function useOnScreen(el: Element | null): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      const last = es[es.length - 1];
      if (last) setOn(last.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return on;
}

/** One background layer, drawn behind the terminal. Nothing in performance mode. */
export function BackgroundLayer({
  spec,
  scene = false,
}: {
  spec: BgSpec | null;
  /** Scene-wide layer: marks itself so CSS can make panes see-through. */
  scene?: boolean;
}) {
  const [perf] = usePref("perf");
  const pageVisible = usePageVisible();
  // State-held element: the observer attaches when the div first appears.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(el);
  const play = shouldPlay({ pageVisible, onScreen, perf });
  const vid = useRef<HTMLVideoElement>(null);
  const isVideo = spec?.kind === "video";
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (play) void v.play()?.catch(() => {});
    else v.pause();
  }, [play, isVideo]);
  if (!spec || perf) return null;
  // GIFs animate on their own: dropping the image while unseen stops them.
  const css = spec.kind === "video" ? null : layerCss(spec);
  const still = spec.kind === "image" && !play;
  return (
    <div
      ref={setEl}
      data-testid="bg-layer"
      data-scene-bg={scene ? "" : undefined}
      aria-hidden="true"
      style={{
        ...FILL,
        ...(isVideo ? {} : css),
        ...(still ? { backgroundImage: "" } : {}),
      }}
    >
      {isVideo && (
        <video
          ref={vid}
          src={assetUrl(spec.ref)}
          muted
          loop
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            ...finish(spec),
          }}
        />
      )}
    </div>
  );
}
