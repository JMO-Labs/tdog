import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json, mockFetch } from "../auth/testutil";
import { ToastProvider } from "../overlays/toast";
import { SettingsPanel } from "./SettingsPanel";
import { themeStore } from "../theme/store";
import { getMotifOpacity, getPref, setPref } from "./prefs";

const session = (on: boolean) => json({ totp_enabled: on, remote: false });

beforeEach(() => {
  localStorage.clear();
  themeStore.reset();
});
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

const confirmEverywhere = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  const d = screen.getByRole("dialog", { name: /sign out everywhere/i });
  await act(async () => {
    fireEvent.click(within(d).getByRole("button", { name: "Sign out" }));
  });
};

test("sign out everywhere asks first, then revokes, toasts and signs out", async () => {
  const { f, out } = await mount({
    "GET /api/session": session(false),
    "POST /api/sessions/revoke-all": json({}),
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  expect(f).not.toHaveBeenCalledWith(
    "/api/sessions/revoke-all",
    expect.anything(),
  );
  await confirmEverywhere();
  expect(f).toHaveBeenCalledWith(
    "/api/sessions/revoke-all",
    expect.objectContaining({ method: "POST" }),
  );
  expect(screen.getByRole("status").textContent).toMatch(/signed out/i);
  expect(out).toHaveBeenCalled();
});

test("cancelling the confirm dialog does nothing", async () => {
  const { f, out } = await mount({ "GET /api/session": session(false) });
  fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(f).not.toHaveBeenCalledWith(
    "/api/sessions/revoke-all",
    expect.anything(),
  );
  expect(out).not.toHaveBeenCalled();
});

test("Escape closes the confirm dialog without revoking", async () => {
  const { out } = await mount({ "GET /api/session": session(false) });
  fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(out).not.toHaveBeenCalled();
});

test("appearance: keyboard focus previews a theme, blur reverts", async () => {
  await mount({ "GET /api/session": session(false) });
  const card = screen.getByRole("button", { name: /Night market/i });
  fireEvent.focus(card);
  expect(themeStore.get().id).toBe("night-market");
  fireEvent.blur(card);
  expect(themeStore.get().id).toBe("memphis-pop");
});

test("sign out everywhere failure toasts and stays", async () => {
  const { out } = await mount({
    "GET /api/session": session(false),
    "POST /api/sessions/revoke-all": json({}, 500),
  });
  await confirmEverywhere();
  expect(out).not.toHaveBeenCalled();
  expect(screen.getByText(/couldn.t sign out/i)).toBeTruthy();
});

test("plain sign out fires the app sign-out event without confirming", async () => {
  await mount({ "GET /api/session": session(false) });
  const on = vi.fn();
  addEventListener("tdog:signout", on);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  removeEventListener("tdog:signout", on);
  expect(on).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("section headings are sentence case", async () => {
  await mount({ "GET /api/session": session(false) });
  for (const h of ["Account", "Appearance", "Personality", "Sessions"])
    expect(screen.getByRole("heading", { name: h })).toBeTruthy();
});

test("appearance: segmented control sets the color mode", async () => {
  await mount({ "GET /api/session": session(false) });
  const r = (n: string) => screen.getByRole("radio", { name: n });
  expect(r("System").getAttribute("aria-checked")).toBe("true");
  fireEvent.click(r("Dark"));
  expect(r("Dark").getAttribute("aria-checked")).toBe("true");
  expect(localStorage.getItem("tdog.theme")).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("appearance: picking a theme persists it; hover previews live", async () => {
  await mount({ "GET /api/session": session(false) });
  const card = screen.getByRole("button", { name: /Night market/i });
  fireEvent.mouseEnter(card);
  expect(themeStore.get().id).toBe("night-market");
  fireEvent.mouseLeave(card);
  expect(themeStore.get().id).toBe("memphis-pop");
  fireEvent.click(card);
  expect(themeStore.get().id).toBe("night-market");
  expect(localStorage.getItem("tdog.theme.id")).toBe("night-market");
  expect(card.getAttribute("aria-pressed")).toBe("true");
  themeStore.select("memphis-pop");
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

test("boot animation toggle defaults on and persists", async () => {
  await mount({ "GET /api/session": session(false) });
  expect(sw(/boot animation/i).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(sw(/boot animation/i));
  expect(localStorage.getItem("tdog.boot")).toBe("0");
  expect(getPref("boot")).toBe(false);
});

test("Dress up Dogbert defaults on and persists", () => {
  localStorage.clear();
  expect(getPref("dress")).toBe(true);
  setPref("dress", false);
  expect(localStorage.getItem("tdog.dress")).toBe("0");
});

test("terminal motif slider persists opacity and applies immediately", async () => {
  await mount({ "GET /api/session": session(false) });
  const slider = screen.getByRole("slider", { name: /terminal motif/i });
  expect((slider as HTMLInputElement).value).toBe("6");
  fireEvent.change(slider, { target: { value: "20" } });
  expect(localStorage.getItem("tdog.motifOpacity")).toBe("20");
  expect(getMotifOpacity()).toBe(20);
  expect((slider as HTMLInputElement).value).toBe("20");
  fireEvent.change(slider, { target: { value: "0" } });
  expect(getMotifOpacity()).toBe(0);
});

test("screen effects: master, intensity and per-effect toggles persist", async () => {
  const { getFx } = await import("../effects/store");
  await mount({ "GET /api/session": session(false) });
  fireEvent.change(screen.getByRole("slider", { name: /intensity/i }), {
    target: { value: "0.5" },
  });
  expect(getFx().intensity).toBe(0.5);
  fireEvent.click(sw(/scanlines/i));
  expect(getFx().on.scanlines).toBe(false);
  fireEvent.click(sw(/all effects/i));
  expect(getFx().master).toBe(false);
  expect(sw(/scanlines/i).hasAttribute("disabled")).toBe(true);
});

test("serious mode disables the theme picker with a note", async () => {
  await mount({ "GET /api/session": () => session(false) });
  const card = () => screen.getByRole("button", { name: /Memphis Pop/ });
  expect(card().hasAttribute("disabled")).toBe(false);
  act(() => setPref("serious", true));
  expect(card().hasAttribute("disabled")).toBe(true);
  expect(screen.getByText(/Serious mode is on/)).toBeTruthy();
  act(() => setPref("serious", false));
  expect(card().hasAttribute("disabled")).toBe(false);
  expect(screen.queryByText(/Serious mode is on/)).toBeNull();
});
