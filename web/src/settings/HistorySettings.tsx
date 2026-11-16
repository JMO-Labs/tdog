import { useState } from "react";
import { apiPut } from "../auth/api";
import { Button } from "../components/ui/button";
import { useToast } from "../overlays/toast";
import { SSH_SNIPPET_BASH, SSH_SNIPPET_ZSH } from "./historySnippet";
import { getHistorySync, setHistorySync, type HistorySync } from "./prefs";

const HOURS: HistorySync[] = ["12", "24", "36"];

/** History section of the settings sheet: where history lives + SSH hook. */
export function HistorySettings() {
  const toast = useToast();
  const [mode, setMode] = useState<HistorySync>(getHistorySync);

  // Persist locally only after the server accepts; otherwise snap back.
  const change = async (next: HistorySync) => {
    const prev = mode;
    setMode(next);
    try {
      const r = await apiPut(
        "/api/journal/settings",
        JSON.stringify({ retentionHours: next === "off" ? 0 : Number(next) }),
        "PUT",
        "application/json",
      );
      if (!r.ok) throw new Error();
      setHistorySync(next);
    } catch {
      setMode(prev);
      toast("fail", "Couldn't save history settings. Try again.");
    }
  };

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast("success", "Copied"),
      () => toast("fail", "Copy failed"),
    );

  return (
    <>
      <h3>History</h3>
      <div className="row setting-stack">
        <div>
          <b>Where history lives</b>
          <p className="muted">
            Sync keeps it on the server so other browsers can search it.
          </p>
        </div>
        <div role="radiogroup" aria-label="History storage">
          <label className="radio-row">
            <input
              type="radio"
              name="history-mode"
              checked={mode === "off"}
              onChange={() => void change("off")}
            />
            This browser only
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="history-mode"
              checked={mode !== "off"}
              onChange={() => void change(mode === "off" ? "24" : mode)}
            />
            Sync to server
          </label>
        </div>
      </div>
      {mode !== "off" && (
        <div className="row">
          <label htmlFor="history-keep">
            <b>Keep for</b>
          </label>
          <select
            id="history-keep"
            value={mode}
            onChange={(e) => void change(e.target.value as HistorySync)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h} hours
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="muted">
        Add to ~/.bashrc or ~/.zshrc on SSH hosts so commands are split and
        searchable.
      </p>
      {(
        [
          ["bash", SSH_SNIPPET_BASH],
          ["zsh", SSH_SNIPPET_ZSH],
        ] as const
      ).map(([name, code]) => (
        <div key={name}>
          <pre>{code}</pre>
          <Button onClick={() => void copy(code)}>Copy {name}</Button>
        </div>
      ))}
    </>
  );
}
