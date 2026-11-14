import { useEffect } from "react";
import { BOOT_MS, type BootId } from "./boot";
import "./boot.css";

const GLYPHS = "01ｱｲｳｴｵｶｷｸ<>/=+*";
const POST = [
  "tdog bios 1.0",
  "memory ........ ok",
  "pty bus ....... ok",
  "socket ........ ok",
  "storage ....... ok",
  "starting shell",
];
const col = (i: number) =>
  Array.from(
    { length: 12 },
    (_, j) => GLYPHS[(i * 7 + j * 3) % GLYPHS.length],
  ).join("\n");

function Scene({ v }: { v: Exclude<BootId, "drop"> }) {
  switch (v) {
    case "tracker":
      return (
        <div className="b-radar">
          <i className="b-sweep" />
          {[0, 1, 2].map((n) => (
            <b key={n} className={`b-ping p${n}`} />
          ))}
        </div>
      );
    case "rain":
      return (
        <>
          <div className="b-cols">
            {Array.from({ length: 16 }, (_, i) => (
              <pre key={i} style={{ animationDelay: `${(i % 5) * 0.12}s` }}>
                {col(i)}
              </pre>
            ))}
          </div>
          <div className="b-word">tdog</div>
        </>
      );
    case "post":
      return (
        <pre className="b-post">
          {POST.map((l, i) => (
            <span key={l} style={{ animationDelay: `${i * 0.3}s` }}>
              {l + "\n"}
            </span>
          ))}
        </pre>
      );
    case "dialup":
      return (
        <div className="b-bars">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <i key={i} style={{ animationDelay: `${i * 0.25}s` }} />
          ))}
        </div>
      );
    case "rewind":
      return (
        <>
          <div className="b-vhs">
            <span className="b-rew">◀◀ rew</span>
            <span className="b-play">▶ play</span>
          </div>
          <i className="b-noise" />
        </>
      );
    case "cartridge":
      return (
        <div className="b-slot">
          <i className="b-cart" />
          <b className="b-led" />
        </div>
      );
    case "wipe":
      return <i className="b-splat" />;
  }
}

/** Full-screen boot overlay for a non-drop variant. Any key or pointer skips. */
export function Boot({
  variant,
  onDone,
}: {
  variant: Exclude<BootId, "drop"> | "fade";
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, variant === "fade" ? 300 : BOOT_MS);
    addEventListener("keydown", onDone, { once: true });
    addEventListener("pointerdown", onDone, { once: true });
    return () => {
      clearTimeout(t);
      removeEventListener("keydown", onDone);
      removeEventListener("pointerdown", onDone);
    };
  }, [variant, onDone]);

  return (
    <div className="boot" data-boot={variant} aria-hidden="true">
      {variant !== "fade" && <Scene v={variant} />}
    </div>
  );
}
