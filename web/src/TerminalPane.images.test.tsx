import { act, render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { setPref } from "./settings/prefs";

const h = vi.hoisted(() => ({ setInlineImages: vi.fn() }));

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize() {}
    size() {
      return { cols: 80, rows: 24 };
    }
    write() {}
    resize() {}
    setTheme() {}
    setCursor() {}
    setInlineImages = h.setInlineImages;
    dispose() {}
  },
}));
vi.stubGlobal(
  "WebSocket",
  class {
    send() {}
    close() {}
  },
);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

import { TerminalPane } from "./TerminalPane";

test("turns inline images on once the async renderer exists, and follows the setting", async () => {
  render(<TerminalPane />);
  // The renderer is created asynchronously, after the setting's effect ran.
  await waitFor(() => expect(h.setInlineImages).toHaveBeenCalledWith(true));
  act(() => setPref("images", false));
  await waitFor(() =>
    expect(h.setInlineImages).toHaveBeenLastCalledWith(false),
  );
});
