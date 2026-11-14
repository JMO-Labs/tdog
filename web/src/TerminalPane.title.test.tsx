import { render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { titleStore } from "./terminal/titles";

const h = vi.hoisted(() => ({
  title: null as null | ((t: string) => void),
  cwd: null as null | ((c: string) => void),
}));

vi.mock("./terminal/xtermRenderer", () => ({
  XtermRenderer: class {
    onInput() {}
    onResize() {}
    onTitle(cb: (t: string) => void) {
      h.title = cb;
    }
    onCwd(cb: (c: string) => void) {
      h.cwd = cb;
    }
    size() {
      return { cols: 80, rows: 24 };
    }
    write() {}
    resize() {}
    setTheme() {}
    dispose() {}
  },
}));
vi.stubGlobal(
  "WebSocket",
  class {
    binaryType = "";
    send() {}
    close() {}
  },
);

import { TerminalPane } from "./TerminalPane";

test("shell title and cwd land in the title store under the pane key", async () => {
  const { unmount } = render(<TerminalPane sceneKey="pane-t" />);
  await waitFor(() => expect(h.title).not.toBeNull());
  h.title!("vim");
  h.cwd!("/tmp");
  expect(titleStore.get("pane-t")).toEqual({ title: "vim", cwd: "/tmp" });
  unmount();
  expect(titleStore.get("pane-t")).toBeUndefined();
});
