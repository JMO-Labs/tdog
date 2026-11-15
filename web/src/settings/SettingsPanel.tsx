import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../auth/api";
import { Button } from "../components/ui/button";
import { useCopy } from "../copy/copy";
import { useToast } from "../overlays/toast";
import { Dialog } from "../overlays/Dialog";
import { Appearance } from "./Appearance";
import { Switch } from "./Switch";
import { TwoFactor } from "./TwoFactor";
import { EFFECT_IDS, FX_LABELS } from "../effects/resolve";
import { setFx, setFxOn, useFx } from "../effects/store";
import { useMotifOpacity, usePref } from "./prefs";
import "./settings.css";

/** Body of the settings sheet. Uses only existing /api endpoints. */
export function SettingsPanel({ onSignedOut }: { onSignedOut: () => void }) {
  const toast = useToast();
  const c = useCopy();
  const [totp, setTotp] = useState(false);
  const [serious, setSerious] = usePref("serious");
  const [pet, setPet] = usePref("pet");
  const [confirm, setConfirm] = useState(false);
  const [motif, setMotif] = useMotifOpacity();
  const [dress, setDress] = usePref("dress");
  const fx = useFx();
  const [boot, setBoot] = usePref("boot");
  const [perf, setPerf] = usePref("perf");

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
    setConfirm(false);
    try {
      const r = await apiPost("/api/sessions/revoke-all");
      if (!r.ok) throw new Error();
    } catch {
      toast("fail", "Couldn't sign out other sessions. Try again.");
      return;
    }
    toast("success", c("settings.signedOutAll"));
    onSignedOut();
  };

  return (
    <div className="settings">
      <h3>Account</h3>
      <TwoFactor enabled={totp} onChange={setTotp} />
      <h3>Appearance</h3>
      <Appearance />
      <div className="row">
        <div>
          <b id="sl-motif">Terminal motif</b>
          <p className="muted">Theme pattern behind text. 0 turns it off.</p>
        </div>
        <input
          type="range"
          min={0}
          max={30}
          aria-labelledby="sl-motif"
          value={motif}
          onChange={(e) => setMotif(Number(e.target.value))}
        />
      </div>
      <h3>Personality</h3>
      <div className="row">
        <div>
          <b id="sw-serious">Serious mode</b>
          <p className="muted">
            Plain light/dark look, no mascot or effects, no slang.
          </p>
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
      <div className="row">
        <div>
          <b id="sw-boot">Boot animation</b>
          <p className="muted">Short intro, once per session. Any key skips.</p>
        </div>
        <Switch labelledBy="sw-boot" checked={boot} onChange={setBoot} />
      </div>
      <h3>Performance</h3>
      <div className="row">
        <div>
          <b id="sw-perf">Performance mode</b>
          <p className="muted">
            Turns off backgrounds, blur and screen effects at once.
          </p>
        </div>
        <Switch labelledBy="sw-perf" checked={perf} onChange={setPerf} />
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
      <div className="row actions">
        <Button onClick={() => dispatchEvent(new Event("tdog:signout"))}>
          Sign out
        </Button>
        <Button variant="danger-quiet" onClick={() => setConfirm(true)}>
          Sign out everywhere
        </Button>
      </div>
      <Dialog
        open={confirm}
        title="Sign out everywhere?"
        onClose={() => setConfirm(false)}
      >
        <p>This ends every session, including this one.</p>
        <div className="dialog-actions">
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger-quiet" onClick={() => void revokeAll()}>
            Sign out
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
