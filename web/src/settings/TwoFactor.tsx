import { useMemo, useState } from "react";
import { apiFetch } from "../auth/api";
import { OtpBoxes } from "../auth/otp";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { encodeQr, qrPath } from "./qr";
import { Switch } from "./Switch";

type Step = "idle" | "enroll" | "recovery" | "disable";
type Enroll = { secret: string; uri: string };

const post = (path: string, body?: unknown) =>
  apiFetch(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });

function QrCode({ text }: { text: string }) {
  const qr = useMemo(() => {
    try {
      return encodeQr(text);
    } catch {
      return null;
    }
  }, [text]);
  if (!qr) return null;
  const n = qr.size + 8;
  return (
    <svg
      role="img"
      aria-label="QR code for your authenticator app"
      viewBox={`0 0 ${n} ${n}`}
      width={176}
      height={176}
      shapeRendering="crispEdges"
      style={{ display: "block", background: "#fff", borderRadius: 6 }}
    >
      <path transform="translate(4 4)" d={qrPath(qr)} fill="#000" />
    </svg>
  );
}

/** Two-factor switch with the enroll/confirm and disable flows. */
export function TwoFactor({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("idle");
    setCode("");
    setPassword("");
    setError("");
  };

  const toggle = async () => {
    if (step === "enroll" || step === "disable") return reset();
    reset();
    if (enabled) return setStep("disable");
    try {
      const r = await post("/api/totp/enroll");
      if (!r.ok) throw new Error();
      setEnroll((await r.json()) as Enroll);
      setStep("enroll");
    } catch {
      setError("Something went wrong starting setup. Try again.");
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = () =>
    run(async () => {
      const r = await post("/api/totp/confirm", { code });
      if (r.status === 401) {
        setError("That code didn't match. Check your app and try again.");
        return;
      }
      if (!r.ok) throw new Error();
      const body = (await r.json()) as { recovery_codes: string[] };
      setCodes(body.recovery_codes);
      setCode("");
      setStep("recovery");
      onChange(true);
    });

  const disable = () =>
    run(async () => {
      const r = await post("/api/totp/disable", { password, code });
      if (r.status === 401) {
        setError("Wrong password or code.");
        return;
      }
      if (r.status === 429) {
        setError("Too many tries. Wait a moment and try again.");
        return;
      }
      if (!r.ok) throw new Error();
      reset();
      onChange(false);
    });

  const shown = enabled;
  return (
    <>
      <div className="row">
        <div>
          <b id="sw-2fa">Two-factor codes</b>
          <p className="muted">
            Highly recommended. Codes from any authenticator app.
          </p>
        </div>
        <Switch
          labelledBy="sw-2fa"
          checked={shown}
          disabled={busy || step === "recovery"}
          onChange={() => void toggle()}
        />
      </div>
      {step === "enroll" && enroll && (
        <div className="subpanel">
          <p className="muted">
            Add this key to your authenticator app, then enter the 6-digit code.
          </p>
          <QrCode text={enroll.uri} />
          <code className="secret">{enroll.secret}</code>{" "}
          <a href={enroll.uri}>Open in app</a>
          <OtpBoxes value={code} onChange={setCode} autoFocus />
          <Button
            variant="primary"
            disabled={busy || code.length < 6}
            onClick={() => void confirm()}
          >
            Confirm
          </Button>
        </div>
      )}
      {step === "recovery" && (
        <div className="subpanel">
          <p className="muted">
            Save these recovery codes. Each works once, and they won't be shown
            again.
          </p>
          <ul className="recovery">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button onClick={reset}>Done</Button>
        </div>
      )}
      {step === "disable" && (
        <div className="subpanel">
          <label className="muted" htmlFor="tfa-pw">
            Password
          </label>
          <Input
            id="tfa-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <OtpBoxes value={code} onChange={setCode} />
          <Button
            variant="danger"
            disabled={busy || !password || code.length < 6}
            onClick={() => void disable()}
          >
            Turn off
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-err">
          {error}
        </p>
      )}
    </>
  );
}
