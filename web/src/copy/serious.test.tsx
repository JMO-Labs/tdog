import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LoginScreen } from "../auth/screens";
import { ToastProvider } from "../overlays/toast";
import { setPref } from "../settings/prefs";
import { ConnectionGag } from "../terminal/ConnectionGag";
import { KillDialog } from "../shell/KillDialog";

const login = vi.hoisted(() => vi.fn());
vi.mock("../auth/api", async (orig) => ({
  ...(await orig<object>()),
  login,
}));
vi.mock("../auth/SignOn", () => ({
  NoNo: ({ detail }: { detail: string }) => <p>{detail}</p>,
  Loading: ({ onDone }: { onDone: () => void }) => (
    <button onClick={onDone}>dial</button>
  ),
}));
vi.mock("../TerminalPane", () => ({ TerminalPane: () => <p>term</p> }));

beforeEach(() => setPref("serious", true));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("connection drop renders plain text in serious mode", () => {
  render(<ConnectionGag phase="tracking" onReconnect={() => {}} />);
  expect(screen.getByText("Connection lost. Reconnecting…")).toBeTruthy();
  expect(screen.queryByText(/tracking/)).toBeNull();
  expect(screen.queryByText(/PLAY|REW/)).toBeNull();
  expect(screen.getByText("Offline")).toBeTruthy();
});

test("rewinding phase has no VHS label in serious mode", () => {
  render(<ConnectionGag phase="rewinding" onReconnect={() => {}} />);
  expect(screen.getByText("Restoring session…")).toBeTruthy();
  expect(screen.queryByText(/PLAY|REW/)).toBeNull();
});

test("kill all renders plain text in serious mode", () => {
  render(
    <KillDialog
      open
      count={2}
      scope="all"
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByText(/2 shells will be terminated/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Kill" })).toBeTruthy();
  expect(screen.queryByText(/nuke|die/i)).toBeNull();
});

test("kill dialog title and decoration are plain in serious mode", () => {
  const { container } = render(
    <KillDialog
      open
      count={1}
      scope="build"
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );
  expect(screen.getByText("Kill scene build?")).toBeTruthy();
  expect(container.ownerDocument.querySelector(".zebra")).toBeNull();
});

test("login shows plain wrong-password text and sign-in toast", async () => {
  const done = vi.fn();
  render(
    <ToastProvider>
      <LoginScreen onDone={done} onNeedSetup={() => {}} />
    </ToastProvider>,
  );
  const submit = () =>
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
  login.mockResolvedValueOnce({ ok: false, kind: "password" });
  submit();
  expect(await screen.findByText("Wrong password.")).toBeTruthy();
  expect(screen.queryByText(/another go/)).toBeNull();
  cleanup();

  render(
    <ToastProvider>
      <LoginScreen onDone={done} onNeedSetup={() => {}} />
    </ToastProvider>,
  );
  login.mockResolvedValueOnce({ ok: true });
  submit();
  fireEvent.click(await screen.findByText("dial"));
  await waitFor(() => expect(screen.getByText("Signed in.")).toBeTruthy());
  expect(screen.queryByText(/shells are right/)).toBeNull();
  expect(done).toHaveBeenCalled();
});

test("setup tape meter and auth gags are plain in serious mode", async () => {
  const { SetupScreen } = await import("../auth/screens");
  const { NoNo } =
    await vi.importActual<typeof import("../auth/SignOn")>("../auth/SignOn");
  render(
    <ToastProvider>
      <SetupScreen onDone={() => {}} />
    </ToastProvider>,
  );
  expect(
    screen.getByText("Password too short. 8 characters minimum."),
  ).toBeTruthy();
  expect(screen.queryByText(/Tape empty|tubular/)).toBeNull();
  cleanup();
  render(<NoNo detail="x" onDone={() => {}} />);
  expect(screen.getByText("Access denied.")).toBeTruthy();
  expect(screen.queryByText(/Ah ah ah/)).toBeNull();
});
