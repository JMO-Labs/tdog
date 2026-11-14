import nonoArm from "../assets/tdog-nono-arm.png";
import nonoBody from "../assets/tdog-nono-body.png";
import waveArm from "../assets/tdog-wave-arm.png";
import waveBody from "../assets/tdog-wave-body.png";

const ART = {
  nono: { arm: nonoArm, body: nonoBody, label: "tdog mascot wagging a finger" },
  wave: { arm: waveArm, body: waveBody, label: "tdog mascot waving hello" },
};

/** Two layers: the arm sits behind the body; only the arm animates. */
export function Mascot({ pose }: { pose: keyof typeof ART }) {
  const a = ART[pose];
  return (
    <div
      className={`mascot ${pose === "nono" ? "wagging" : "waving"}`}
      role="img"
      aria-label={a.label}
    >
      <img className="m-arm" src={a.arm} alt="" />
      <img className="m-body" src={a.body} alt="" />
    </div>
  );
}
