import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SLANG, pickHeadline, ToastProvider, useToast } from "./toast";

function Fire({ kind }: { kind: "success" | "fail" | "warn" | "info" }) {
  const toast = useToast();
  return <button onClick={() => toast(kind, "saved ok")}>go</button>;
}

describe("toasts", () => {
  it("shows a slang headline above the detail", () => {
    render(
      <ToastProvider>
        <Fire kind="success" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    const el = screen.getByText("saved ok").closest(".toast")!;
    expect(el.classList.contains("success")).toBe(true);
    expect(SLANG.success).toContain(el.querySelector("b")!.textContent);
  });
  it("drops the headline in serious mode", () => {
    render(
      <ToastProvider serious>
        <Fire kind="fail" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    const el = screen.getByText("saved ok").closest(".toast")!;
    expect(el.querySelector("b")).toBeNull();
  });
  it("info toasts fall back to the success slang pool", () => {
    render(
      <ToastProvider>
        <Fire kind="info" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    const el = screen.getByText("saved ok").closest(".toast")!;
    expect(el.className).toContain("info");
    expect(SLANG.success).toContain(el.querySelector("b")!.textContent);
  });
  it("pickHeadline uses injected rng; info uses success pool", () => {
    expect(pickHeadline("fail", false, () => 0)).toBe(SLANG.fail[0]);
    expect(pickHeadline("info", false, () => 0.999)).toBe(
      SLANG.success[SLANG.success.length - 1],
    );
    expect(pickHeadline("info", true, () => 0)).toBe("");
  });
  it("dismisses on click", async () => {
    render(
      <ToastProvider>
        <Fire kind="warn" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    await act(async () => {
      fireEvent.click(screen.getByText("saved ok"));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    expect(screen.queryByText("saved ok")).toBeNull();
  });
});
