import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { bootFor, takeBoot } from "./boot";
import { Boot } from "./Boot";
import { getPref } from "../settings/prefs";
import { themeStore } from "../theme/store";
import { useThemeMode } from "../theme/useThemeMode";
import { IconButton } from "../components/ui/button";
import { prefersReducedMotion } from "../motion/confetti";

const LETTERS = ["t", "d", "o", "g"];
const ICON = { system: "◐", light: "☀", dark: "☾" } as const;

/** Confetti backdrop, extruded wordmark (letters drop in once per session), theme toggle. */
export function AuthShell({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState(() =>
    getPref("boot") && !getPref("serious") && takeBoot()
      ? bootFor(themeStore.get().id, prefersReducedMotion())
      : null,
  );
  const booting = variant === "drop";
  const endBoot = useCallback(() => setVariant(null), []);
  const mark = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const { mode, cycle } = useThemeMode();

  useEffect(() => {
    if (!booting) return;
    const anims: Animation[] = [];
    const run = (
      el: Element | null,
      kf: Keyframe[],
      o: KeyframeAnimationOptions,
    ) => {
      if (el && typeof el.animate === "function") anims.push(el.animate(kf, o));
    };
    [...(mark.current?.children ?? [])].forEach((l, i) =>
      run(
        l,
        [
          { transform: "translateY(-120vh) rotate(-40deg)" },
          { transform: "translateY(10px) rotate(6deg)", offset: 0.7 },
          { transform: "none" },
        ],
        { duration: 700, delay: i * 140, fill: "backwards" },
      ),
    );
    run(
      card.current,
      [
        { transform: "translateY(60px) rotate(3deg)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 600, delay: 650, fill: "backwards" },
    );
    const skip = () => anims.forEach((a) => a.finish());
    addEventListener("keydown", skip, { once: true });
    addEventListener("pointerdown", skip, { once: true });
    return () => {
      removeEventListener("keydown", skip);
      removeEventListener("pointerdown", skip);
    };
  }, [booting]);

  return (
    <main className="auth" data-booting={booting || undefined}>
      {variant && variant !== "drop" && (
        <Boot variant={variant} onDone={endBoot} />
      )}
      <IconButton label={`Theme: ${mode}`} className="corner" onClick={cycle}>
        {ICON[mode]}
      </IconButton>
      <div className="auth-stack">
        <div className="brand">
          <span className="logo-mark big" aria-hidden="true" />
          <h1 className="wordmark big" aria-label="tdog" ref={mark}>
            {LETTERS.map((l) => (
              <span key={l} aria-hidden="true">
                {l}
              </span>
            ))}
          </h1>
        </div>
        <div ref={card}>{children}</div>
      </div>
    </main>
  );
}
