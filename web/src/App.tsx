import { lazy, Suspense } from "react";
import { TerminalPane } from "./TerminalPane";
import { isBenchRoute } from "./routes";

// Dead-code eliminated from production builds (import.meta.env.DEV is false).
const BenchPage = import.meta.env.DEV
  ? lazy(() =>
      import("./bench/BenchPage").then((m) => ({ default: m.BenchPage })),
    )
  : null;

export function App() {
  if (BenchPage && isBenchRoute(import.meta.env.DEV, location.pathname))
    return (
      <Suspense fallback={null}>
        <BenchPage />
      </Suspense>
    );
  return (
    <div style={{ height: "100vh", background: "#000" }}>
      <TerminalPane />
    </div>
  );
}
