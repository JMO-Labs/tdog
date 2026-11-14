import arm from "../assets/tdog-wave-arm.png";
import body from "../assets/tdog-wave-body.png";

/** Idle waving mascot (mockup `.mascot.pane-dog`). */
export function Mascot() {
  return (
    <div className="mascot pane-dog" role="img" aria-label="tdog mascot waving">
      <img className="m-arm" src={arm} alt="" />
      <img className="m-body" src={body} alt="" />
    </div>
  );
}
