import { useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "./api";
import { MIN_PASSWORD } from "./constants";
import { OtpBoxes } from "./otp";
import { AuthShell } from "./shell";
import { DialUp, NoNo } from "./SignOn";
import { celebrate } from "./celebrate";
import { useToast } from "../overlays/toast";
import { tape } from "./tape";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Input } from "../components/ui/input";

function Err({ msg }: { msg: string }) {
  return (
    <p role="alert" className="field-error">
      {msg}
    </p>
  );
}

export function message(r: Exclude<api.AuthResult, { ok: true }>): string {
  switch (r.kind) {
    case "token":
      return "Invalid setup token.";
    case "password":
      return "Incorrect password.";
    case "totp":
      return "Enter your authentication code.";
    case "code":
      return "Invalid authentication code.";
    case "short":
      return `Password must be at least ${MIN_PASSWORD} characters.`;
    case "limited":
      return `Too many attempts. Retry in ${r.retryAfter ?? 1}s.`;
    case "done":
      return "Already set up. Please sign in.";
    default:
      return "Something went wrong. Try again.";
  }
}

export function LoginScreen(props: {
  onDone: () => void;
  onNeedSetup: () => void;
}) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [nono, setNono] = useState(false);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const recoveryInput = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (recovery) recoveryInput.current?.focus();
  }, [recovery]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api.login(pw, needCode ? code.trim() : undefined);
      if (r.ok) return setDialing(true);
      if (r.kind === "setup") return props.onNeedSetup();
      if (r.kind === "totp") {
        setNeedCode(true);
        return;
      }
      if (r.kind === "code") setCode("");
      if (r.kind === "password") setNono(true);
      setErr(message(r));
    } catch {
      setErr(message({ ok: false, kind: "other" }));
    } finally {
      setBusy(false);
      if (!needCode) input.current?.focus();
    }
  }

  const overlays = (
    <>
      {nono && (
        <NoNo
          detail="Wrong password. Give it another go."
          onDone={() => {
            setNono(false);
            input.current?.select();
          }}
        />
      )}
      {dialing && (
        <DialUp
          onDone={() => {
            celebrate();
            toast(
              "success",
              "Signed in. Your shells are right where you left them.",
            );
            props.onDone();
          }}
        />
      )}
    </>
  );

  if (needCode)
    return (
      <AuthShell>
        <form className="card auth-card" onSubmit={submit} noValidate>
          <h2 className="card-title">One more thing</h2>
          <p className="muted">
            {recovery
              ? "Enter one of your recovery codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
          {recovery ? (
            <Field label="Recovery code">
              <Input
                ref={recoveryInput}
                type="text"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          ) : (
            <OtpBoxes value={code} onChange={setCode} autoFocus />
          )}
          {err && <Err msg={err} />}
          <Button
            variant="primary"
            className="wide"
            type="submit"
            disabled={busy}
          >
            Verify
          </Button>
          <Button
            variant="ghost"
            className="wide"
            onClick={() => {
              setRecovery((v) => !v);
              setCode("");
              setErr("");
            }}
          >
            {recovery ? "Use an authenticator code" : "Use a recovery code"}
          </Button>
        </form>
        {overlays}
      </AuthShell>
    );

  return (
    <AuthShell>
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h2 className="card-title">Welcome back</h2>
        <p className="muted">
          Sign in to get your shells back where you left them.
        </p>
        <Field label="Password">
          <Input
            ref={input}
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        {err && <Err msg={err} />}
        <Button
          variant="primary"
          className="wide"
          type="submit"
          disabled={busy}
        >
          Sign in
        </Button>
      </form>
      {overlays}
    </AuthShell>
  );
}

export function SetupScreen(props: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialing, setDialing] = useState(false);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const meter = tape(pw.length);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== confirm) return setErr("Passwords do not match.");
    if (pw.length < MIN_PASSWORD)
      return setErr(message({ ok: false, kind: "short" }));
    setBusy(true);
    setErr("");
    try {
      const r = await api.setup(token, pw);
      if (r.ok || r.kind === "done") return setDialing(true);
      setErr(message(r));
    } catch {
      setErr(message({ ok: false, kind: "other" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h2 className="card-title">Set up tdog</h2>
        <p className="muted">
          Paste the setup token from the server log, then pick a password.
        </p>
        <Field label="Setup token">
          <Input
            ref={input}
            type="password"
            className="mono"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <div className="tape" aria-hidden="true">
          <i style={{ width: `${meter.pct}%` }} />
        </div>
        <p className="tape-label muted" role="status">
          {meter.label}
        </p>
        <Field label="Confirm password">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {err && <Err msg={err} />}
        <Button
          variant="primary"
          className="wide"
          type="submit"
          disabled={busy}
        >
          Create account
        </Button>
      </form>
      {dialing && (
        <DialUp
          onDone={() => {
            celebrate();
            toast("success", "Account created. You're in.");
            props.onDone();
          }}
        />
      )}
    </AuthShell>
  );
}
