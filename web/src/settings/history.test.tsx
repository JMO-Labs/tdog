import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { json } from "../auth/testutil";
import { ToastProvider } from "../overlays/toast";
import { HistorySettings } from "./HistorySettings";
import { getHistorySync } from "./prefs";
import { SSH_SNIPPET_BASH } from "./historySnippet";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function mount(status = 200) {
  const f = vi.fn(async () => json({}, status));
  vi.stubGlobal("fetch", f);
  render(
    <ToastProvider>
      <HistorySettings />
    </ToastProvider>,
  );
  return f;
}
const put = (f: ReturnType<typeof vi.fn>, i = 0) =>
  (f.mock.calls[i] as unknown as [string, RequestInit])[1].body as string;

test("defaults to this browser only, no retention select", () => {
  mount();
  expect(
    (screen.getByLabelText("This browser only") as HTMLInputElement).checked,
  ).toBe(true);
  expect(screen.queryByLabelText("Keep for")).toBeNull();
  expect(getHistorySync()).toBe("off");
});

test("choosing sync PUTs retentionHours 24 and persists after 2xx", async () => {
  const f = mount();
  fireEvent.click(screen.getByLabelText("Sync to server"));
  await waitFor(() => expect(getHistorySync()).toBe("24"));
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/journal/settings");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(put(f))).toEqual({ retentionHours: 24 });
  fireEvent.change(screen.getByLabelText("Keep for"), {
    target: { value: "36" },
  });
  await waitFor(() => expect(getHistorySync()).toBe("36"));
  expect(JSON.parse(put(f, 1))).toEqual({ retentionHours: 36 });
  fireEvent.click(screen.getByLabelText("This browser only"));
  await waitFor(() => expect(getHistorySync()).toBe("off"));
  expect(JSON.parse(put(f, 2))).toEqual({ retentionHours: 0 });
});

test("failure reverts the radio and keeps the pref", async () => {
  const f = mount(500);
  fireEvent.click(screen.getByLabelText("Sync to server"));
  await waitFor(() => expect(f).toHaveBeenCalled());
  await act(async () => {});
  expect(getHistorySync()).toBe("off");
  expect(
    (screen.getByLabelText("This browser only") as HTMLInputElement).checked,
  ).toBe(true);
  expect(screen.getByText(/Couldn't save/)).toBeTruthy();
});

test("shows the SSH snippet", () => {
  mount();
  expect(screen.getByText(/Add to ~\/.bashrc/)).toBeTruthy();
  expect(document.body.textContent).toContain(SSH_SNIPPET_BASH.split("\n")[0]);
  expect(screen.getAllByRole("button", { name: /Copy/ }).length).toBe(2);
});

test("failed retention change reverts the select", async () => {
  localStorage.setItem("tdog.historySync", "24");
  const f = mount(500);
  fireEvent.change(screen.getByLabelText("Keep for"), {
    target: { value: "12" },
  });
  await waitFor(() => expect(f).toHaveBeenCalled());
  await act(async () => {});
  expect(getHistorySync()).toBe("24");
  expect((screen.getByLabelText("Keep for") as HTMLSelectElement).value).toBe(
    "24",
  );
});

test("storage setting stacks label above the radios", () => {
  mount();
  const group = screen.getByRole("radiogroup", { name: "History storage" });
  expect(group.parentElement?.classList.contains("setting-stack")).toBe(true);
});
