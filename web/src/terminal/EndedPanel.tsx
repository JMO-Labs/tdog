import { Button } from "../components/ui/button";

/** Styled state for a pane whose shell was killed or exited. */
export function EndedPanel({
  killed,
  exitCode,
  onStart,
}: {
  killed: boolean;
  exitCode?: number;
  onStart: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="ended-panel"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "color-mix(in srgb, #000 70%, transparent)",
        color: "#eee",
      }}
    >
      <strong>
        {killed ? "Shell killed" : `Shell exited with code ${exitCode}`}
      </strong>
      <Button variant="primary" onClick={onStart}>
        {killed ? "Start a new shell" : "Reconnect"}
      </Button>
    </div>
  );
}
