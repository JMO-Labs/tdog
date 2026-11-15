import { useState, useCallback } from "react";
import type { PaneOverlayContext } from "../../../terminal/renderer";
import { DiffForm } from "./DiffForm";
import { DiffView } from "./DiffView";
import type { DiffResult, DiffError } from "./types";
import { apiPost } from "../../../auth/api";

export type DiffPhase = "form" | "loading" | "view" | "error";

export function DiffOverlay(ctx: PaneOverlayContext) {
  const [phase, setPhase] = useState<DiffPhase>("form");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<DiffError | null>(null);

  const handleDiff = useCallback(
    async (pathA: string, pathB: string) => {
      if (!ctx.sessionId) {
        setError({ status: 0, message: "No session available" });
        setPhase("error");
        return;
      }

      setPhase("loading");
      setError(null);

      try {
        const response = await apiPost("/api/diff", {
          session: ctx.sessionId,
          a: pathA,
          b: pathB,
          context: 3,
        });

        if (response.ok) {
          const data = (await response.json()) as DiffResult;
          setResult(data);
          setPhase("view");
        } else {
          const message = await response.text();
          setError({
            status: response.status,
            message: formatErrorMessage(response.status, message),
          });
          setPhase("error");
        }
      } catch (err) {
        setError({
          status: 0,
          message: `Failed to fetch diff: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
        setPhase("error");
      }
    },
    [ctx.sessionId],
  );

  const handleBack = useCallback(() => {
    setPhase("form");
    setResult(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    ctx.close();
  }, [ctx]);

  if (phase === "form") {
    return <DiffForm cwd={ctx.cwd} onDiff={handleDiff} onClose={handleClose} />;
  }

  if (phase === "loading") {
    return (
      <div className="diff-overlay-container">
        <div style={{ padding: "20px", textAlign: "center" }}>
          <p>Loading diff...</p>
        </div>
      </div>
    );
  }

  if (phase === "error" && error) {
    return (
      <div className="diff-overlay-container">
        <div style={{ padding: "20px" }}>
          <h2>Error</h2>
          <p>{error.message}</p>
          <button onClick={handleBack}>Back</button>
          <button onClick={handleClose}>Close</button>
        </div>
      </div>
    );
  }

  if (phase === "view" && result) {
    return (
      <DiffView
        result={result}
        onBack={handleBack}
        onClose={handleClose}
        onCopy={ctx.copy}
      />
    );
  }

  return null;
}

function formatErrorMessage(status: number, message: string): string {
  switch (status) {
    case 400:
      return `Bad request: ${message}`;
    case 404:
      return `File not found: ${message}`;
    case 408:
      return `Timeout: ${message}`;
    case 413:
      return `Files too large or differ too much: ${message}`;
    case 415:
      return `Binary file: ${message}`;
    case 429:
      return `Server busy: ${message}`;
    default:
      return `Error (${status}): ${message}`;
  }
}
