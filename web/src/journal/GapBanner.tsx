import { Button } from "../components/ui/button";
import { useGapBanner } from "./useGapBanner";

/** Slim notice over a pane whose ssh link was parked: offers a restore. */
export function GapBanner({
  pane,
  onRestore,
}: {
  pane: string | undefined;
  onRestore: (rec: number) => void;
}) {
  const { state, restoring, dismiss } = useGapBanner(pane);
  if (!state) return null;
  return (
    <div
      role="status"
      data-testid="gap-banner"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        fontSize: 12,
        background: "color-mix(in srgb, #000 70%, transparent)",
        color: "#eee",
      }}
    >
      <span style={{ flex: 1 }}>
        {"text" in state
          ? state.text
          : state.phase === "offer"
            ? "Output while disconnected isn't in history."
            : "Restoring…"}
      </span>
      {state.phase === "offer" && (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            restoring();
            onRestore(state.rec);
          }}
        >
          Restore from host
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={dismiss}>
        Dismiss
      </Button>
    </div>
  );
}
