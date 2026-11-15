import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("../journal/useJournalSearch", () => ({
  useJournalSearch: () => ({ hits: [], done: true }),
}));
vi.mock("../TerminalPane", () => ({ TerminalPane: () => null }));
vi.mock("../studio/TerminalPreview", () => ({ TerminalPreview: () => null }));
import { Workspace } from "./Workspace";
import { ToastProvider } from "../overlays/toast";

it("Ctrl+Shift+F opens the search panel", () => {
  render(
    <ToastProvider>
      <Workspace />
    </ToastProvider>,
  );
  expect(screen.queryByRole("dialog", { name: "Search history" })).toBeNull();
  fireEvent.keyDown(document, { key: "F", ctrlKey: true, shiftKey: true });
  expect(screen.getByRole("dialog", { name: "Search history" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Search history" })).toBeNull();
});
