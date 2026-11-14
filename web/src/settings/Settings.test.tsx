import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";
import { ToastProvider } from "../overlays/toast";
import { SettingsPanel } from "./SettingsPanel";
import { getPref, setPref } from "./prefs";

const session = (on: boolean) => json({ totp_enabled: on, remote: false });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

async function mount(routes: Parameters<typeof mockFetch>[0], out = vi.fn()) {
  const f = mockFetch(routes);
  vi.stubGlobal("fetch", f);
  await act(async () => {
    render(
      <ToastProvider>
        <SettingsPanel onSignedOut={out} />
      </ToastProvider>,
    );
  });
  return { f, out };
}

const sw = (name: RegExp) => screen.getByRole("switch", { name });
const type = (code: string) =>
  fireEvent.paste(screen.getAllByRole("textbox")[0], {
    clipboardData: { getData: () => code },
  });

test("serious mode and pet persist and apply immediately", async () => {
  await mount({ "GET /api/session": session(false) });
  expect(sw(/serious/i).getAttribute("aria-checked")).toBe("false");
  fireEvent.click(sw(/serious/i));
  expect(sw(/serious/i).getAttribute("aria-checked")).toBe("true");
  expect(localStorage.getItem("tdog.serious")).toBe("1");
  expect(getPref("serious")).toBe(true);
  fireEvent.click(sw(/pet/i));
  expect(localStorage.getItem("tdog.pet")).toBe("0");
  expect(getPref("pet")).toBe(false);
  act(() => setPref("pet", true));
  expect(sw(/pet/i).getAttribute("aria-checked")).toBe("true");
});

test("enable 2FA: enroll, confirm, show recovery codes", async () => {
  const { f } = await mount({
    "GET /api/session": session(false),
    "POST /api/totp/enroll": json({ secret: "ABCD", uri: "otpauth://totp/x" }),
    "POST /api/totp/confirm": json({ recovery_codes: ["r1-aaa", "r2-bbb"] }),
  });
  await act(async () => void fireEvent.click(sw(/two-factor/i)));
  expect(screen.getByText("ABCD")).toBeTruthy();
  const qr = screen.getByRole("img", { name: /qr/i });
  expect(qr.querySelector("path")!.getAttribute("d")).toMatch(/^M\d+ \d+h/);
  type("123456");
  await act(async () => void fireEvent.click(screen.getByText("Confirm")));
  const call = f.mock.calls.find(([u]) => u === "/api/totp/confirm")!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({ code: "123456" });
  expect(screen.getByText("r1-aaa")).toBeTruthy();
  expect(sw(/two-factor/i).getAttribute("aria-checked")).toBe("true");
});

test("enable 2FA: wrong code shows a plain error", async () => {
  await mount({
    "GET /api/session": session(false),
    "POST /api/totp/enroll": json({ secret: "ABCD", uri: "otpauth://x" }),
    "POST /api/totp/confirm": json({ error: "invalid code" }, 401),
  });
  await act(async () => void fireEvent.click(sw(/two-factor/i)));
  type("000000");
  await act(async () => void fireEvent.click(screen.getByText("Confirm")));
  expect(screen.getByRole("alert").textContent).toMatch(/didn.t match/i);
  expect(sw(/two-factor/i).getAttribute("aria-checked")).toBe("false");
});

test("enroll failure is reported plainly", async () => {
  await mount({
    "GET /api/session": session(false),
    "POST /api/totp/enroll": json({}, 500),
  });
  await act(async () => void fireEvent.click(sw(/two-factor/i)));
  expect(screen.getByRole("alert").textContent).toMatch(/went wrong/i);
});

test("disable 2FA: password + code, errors then success", async () => {
  let status = 401;
  const { f } = await mount({
    "GET /api/session": session(true),
    "POST /api/totp/disable": () => json({}, status),
  });
  expect(sw(/two-factor/i).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(sw(/two-factor/i));
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "pw" },
  });
  type("654321");
  await act(async () => void fireEvent.click(screen.getByText("Turn off")));
  expect(screen.getByRole("alert").textContent).toMatch(/password or code/i);
  status = 429;
  await act(async () => void fireEvent.click(screen.getByText("Turn off")));
  expect(screen.getByRole("alert").textContent).toMatch(/too many/i);
  status = 200;
  await act(async () => void fireEvent.click(screen.getByText("Turn off")));
  const call = f.mock.calls.filter(([u]) => u === "/api/totp/disable").at(-1)!;
  expect(JSON.parse(call[1]!.body as string)).toEqual({
    password: "pw",
    code: "654321",
  });
  expect(sw(/two-factor/i).getAttribute("aria-checked")).toBe("false");
});

test("sign out everywhere calls revoke-all, toasts, then signs out", async () => {
  const { f, out } = await mount({
    "GET /api/session": session(false),
    "POST /api/sessions/revoke-all": json({}),
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Sign out everywhere"));
  });
  expect(f).toHaveBeenCalledWith(
    "/api/sessions/revoke-all",
    expect.objectContaining({ method: "POST" }),
  );
  expect(screen.getByRole("status").textContent).toMatch(/signed out/i);
  expect(out).toHaveBeenCalled();
});

test("sign out everywhere failure toasts and stays", async () => {
  const { out } = await mount({
    "GET /api/session": session(false),
    "POST /api/sessions/revoke-all": json({}, 500),
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Sign out everywhere"));
  });
  expect(out).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toMatch(/couldn.t/i);
});

test("session lookup failure leaves 2FA off without crashing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
  await act(async () => {
    render(<SettingsPanel onSignedOut={() => {}} />);
  });
  expect(sw(/two-factor/i).getAttribute("aria-checked")).toBe("false");
});

test("enroll: unencodable URI hides the QR but keeps the manual key", async () => {
  await mount({
    "GET /api/session": session(false),
    "POST /api/totp/enroll": json({ secret: "ABCD", uri: "x".repeat(5000) }),
  });
  await act(async () => void fireEvent.click(sw(/two-factor/i)));
  expect(screen.getByText("ABCD")).toBeTruthy();
  expect(screen.queryByRole("img", { name: /qr/i })).toBeNull();
});

test("confirm server error shows a generic retry message", async () => {
  await mount({
    "GET /api/session": session(false),
    "POST /api/totp/enroll": json({ secret: "ABCD", uri: "otpauth://x" }),
    "POST /api/totp/confirm": json({}, 500),
  });
  await act(async () => void fireEvent.click(sw(/two-factor/i)));
  type("123456");
  await act(async () => void fireEvent.click(screen.getByText("Confirm")));
  expect(screen.getByRole("alert").textContent).toMatch(/went wrong\. try/i);
});
