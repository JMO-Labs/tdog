import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { TerminalPane } from "./TerminalPane";
import { getStatus, setUnauthorizedHandler } from "./auth/api";
import { LoginScreen, SetupScreen } from "./auth/screens";
import { isBenchRoute, isKitRoute } from "./routes";

// Dead-code eliminated from production builds (import.meta.env.DEV is false).
const BenchPage = import.meta.env.DEV
  ? lazy(() =>
      import("./bench/BenchPage").then((m) => ({ default: m.BenchPage })),
    )
  : null;

const KitPage = import.meta.env.DEV
  ? lazy(() => import("./kit/KitPage").then((m) => ({ default: m.KitPage })))
  : null;

type View = "loading" | "setup" | "login" | "app";

export function App() {
  if (BenchPage && isBenchRoute(import.meta.env.DEV, location.pathname))
    return (
      <Suspense fallback={null}>
        <BenchPage />
      </Suspense>
    );
  if (KitPage && isKitRoute(import.meta.env.DEV, location.pathname))
    return (
      <Suspense fallback={null}>
        <KitPage />
      </Suspense>
    );
  return <AuthApp />;
}

function AuthApp() {
  const [view, setView] = useState<View>("loading");

  const check = useCallback(async () => {
    try {
      const s = await getStatus();
      setView(s.setup ? "setup" : s.authenticated ? "app" : "login");
    } catch {
      setView("login");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Any 401 from an authenticated API call returns the user to login.
  useEffect(() => {
    setUnauthorizedHandler(() => setView("login"));
    return () => setUnauthorizedHandler(null);
  }, []);

  // Terminal socket closed: if the session is gone (401), go back to login.
  const onClosed = useCallback(() => {
    void getStatus().then(
      (s) => {
        if (!s.authenticated) setView(s.setup ? "setup" : "login");
      },
      () => {},
    );
  }, []);

  if (view === "loading")
    return (
      <div role="status" style={{ color: "#eee", padding: 16 }}>
        Loading…
      </div>
    );
  if (view === "setup") return <SetupScreen onDone={() => setView("login")} />;
  if (view === "login")
    return (
      <LoginScreen
        onDone={() => setView("app")}
        onNeedSetup={() => setView("setup")}
      />
    );
  return (
    <div style={{ height: "100vh", background: "#000" }}>
      <TerminalPane onClosed={onClosed} />
    </div>
  );
}
