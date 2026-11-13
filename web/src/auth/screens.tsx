import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import * as api from "./api";

const MIN_PASSWORD = 8;

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 360,
        margin: "10vh auto",
        padding: 16,
        color: "#eee",
        font: "16px system-ui",
      }}
    >
      <h1 style={{ fontSize: 22 }}>{title}</h1>
      {children}
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  autoComplete?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "block", margin: "12px 0" }}>
      {props.label}
      <input
        ref={props.inputRef}
        type={props.type ?? "password"}
        required
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={{
          display: "block",
          width: "100%",
          padding: 6,
          marginTop: 4,
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <p role="alert" style={{ color: "#ff8080" }}>
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
  const input = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (needCode) codeInput.current?.focus();
  }, [needCode]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api.login(pw, needCode ? code.trim() : undefined);
      if (r.ok) return props.onDone();
      if (r.kind === "setup") return props.onNeedSetup();
      if (r.kind === "totp") {
        setNeedCode(true);
        return;
      }
      setErr(message(r));
    } catch {
      setErr(message({ ok: false, kind: "other" }));
    } finally {
      setBusy(false);
      if (!needCode) input.current?.focus();
      else codeInput.current?.focus();
    }
  }

  return (
    <Shell title="Sign in to tdog">
      <form onSubmit={submit}>
        <Field
          label="Password"
          value={pw}
          onChange={setPw}
          inputRef={input}
          autoComplete="current-password"
        />
        {needCode && (
          <Field
            label="Authentication code"
            type="text"
            value={code}
            onChange={setCode}
            inputRef={codeInput}
            autoComplete="one-time-code"
          />
        )}
        {err && <Err msg={err} />}
        <button type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
    </Shell>
  );
}

export function SetupScreen(props: { onDone: () => void }) {
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== confirm) return setErr("Passwords do not match.");
    if (pw.length < MIN_PASSWORD)
      return setErr(message({ ok: false, kind: "short" }));
    setBusy(true);
    setErr("");
    try {
      const r = await api.setup(token, pw);
      if (r.ok || r.kind === "done") return props.onDone();
      setErr(message(r));
    } catch {
      setErr(message({ ok: false, kind: "other" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Set up tdog">
      <p>
        Enter the setup token printed in the server log and choose a password.
      </p>
      <form onSubmit={submit}>
        <Field
          label="Setup token"
          value={token}
          onChange={setToken}
          inputRef={input}
        />
        <Field
          label="Password"
          value={pw}
          onChange={setPw}
          autoComplete="new-password"
        />
        <Field
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {err && <Err msg={err} />}
        <button type="submit" disabled={busy}>
          Create account
        </button>
      </form>
    </Shell>
  );
}
