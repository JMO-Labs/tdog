import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../auth/api";
import { Button } from "../components/ui/button";
import { useToast } from "../overlays/toast";
import { Switch } from "./Switch";
import { TwoFactor } from "./TwoFactor";
import { EFFECT_IDS, FX_LABELS } from "../effects/resolve";
import { setFx, setFxOn, useFx } from "../effects/store";
import { usePref } from "./prefs";
import "./settings.css";

/** Body of the settings sheet. Uses only existing /api endpoints. */
export function SettingsPanel({ onSignedOut }: { onSignedOut: () => void }) {
  const toast = useToast();
  const [totp, setTotp] = useState(false);
  const [serious, setSerious] = usePref("serious");
  const [pet, setPet] = usePref("pet");
  const [dress, setDress] = usePref("dress");
  const fx = useFx();

  useEffect(() => {
    let live = true;
    apiFetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { totp_enabled?: boolean } | null) => {
        if (live && s) setTotp(!!s.totp_enabled);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const revokeAll = async () => {
    try {
      const r = await apiPost("/api/sessions/revoke-all");
      if (!r.ok) throw new Error();
    } catch {
      toast("fail", "Couldn't sign out other sessions. Try again.");
      return;
    }
    toast("success", "Signed out everywhere.");
    onSignedOut();
  };

  return (
    <div className="settings">
      <h3>Account</h3>
      <TwoFactor enabled={totp} onChange={setTotp} />
      <h3>Personality</h3>
      <div className="row">
        <div>
          <b id="sw-serious">Serious mode</b>
          <p className="muted">Drops the slang from messages.</p>
        </div>
        <Switch
          labelledBy="sw-serious"
          checked={serious}
          onChange={setSerious}
        />
      </div>
      <div className="row">
        <div>
          <b id="sw-pet">Status bar pet</b>
          <p className="muted">Sleeps when shells idle, wakes on output.</p>
        </div>
        <Switch labelledBy="sw-pet" checked={pet} onChange={setPet} />
      </div>
      <div className="row">
        <div>
          <b id="sw-dress">Dress up Dogbert</b>
          <p className="muted">Wears the costume of the active theme.</p>
        </div>
        <Switch labelledBy="sw-dress" checked={dress} onChange={setDress} />
      </div>
      <h3>Screen effects</h3>
      <div className="row">
        <b id="sw-fx">All effects</b>
        <Switch
          labelledBy="sw-fx"
          checked={fx.master}
          onChange={(master) => setFx({ ...fx, master })}
        />
      </div>
      <div className="row">
        <b id="fx-int">Intensity</b>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          aria-labelledby="fx-int"
          value={fx.intensity}
          disabled={!fx.master}
          onChange={(e) => setFx({ ...fx, intensity: +e.target.value })}
        />
      </div>
      {EFFECT_IDS.map((id) => (
        <div className="row" key={id}>
          <b id={`fx-${id}`}>{FX_LABELS[id]}</b>
          <Switch
            labelledBy={`fx-${id}`}
            checked={fx.on[id]}
            disabled={!fx.master}
            onChange={(on) => setFxOn(id, on)}
          />
        </div>
      ))}
      <h3>Sessions</h3>
      <Button
        variant="danger"
        className="wide"
        onClick={() => void revokeAll()}
      >
        Sign out everywhere
      </Button>
    </div>
  );
}
