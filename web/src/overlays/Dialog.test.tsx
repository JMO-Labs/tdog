import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";
import { Sheet } from "./Sheet";

describe("Dialog / Sheet", () => {
  it("renders a labelled modal and closes on Escape and backdrop", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Sure?" onClose={onClose}>
        body
      </Dialog>,
    );
    const d = screen.getByRole("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Sure?")).toBeTruthy();
    fireEvent.keyDown(d, { key: "Escape" });
    fireEvent.click(document.querySelector(".overlay-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("does not close when clicking inside the dialog", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Sure?" onClose={onClose}>
        body
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} title="t" onClose={vi.fn()}>
        x
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("sheet is a right drawer dialog", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Settings" onClose={onClose}>
        s
      </Sheet>,
    );
    expect(screen.getByRole("dialog").classList.contains("sheet")).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
  it("sheet has a close button and returns focus to the opener", () => {
    const onClose = vi.fn();
    const Host = ({ open }: { open: boolean }) => (
      <>
        <button>gear</button>
        <Sheet open={open} title="Settings" onClose={onClose}>
          body
        </Sheet>
      </>
    );
    const { rerender } = render(<Host open={false} />);
    const gear = screen.getByText("gear");
    gear.focus();
    rerender(<Host open />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Host open={false} />);
    expect(document.activeElement).toBe(gear);
  });
});
