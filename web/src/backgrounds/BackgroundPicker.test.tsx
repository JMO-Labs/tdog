import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { json } from "../auth/testutil";
import { BackgroundPicker } from "./BackgroundPicker";
import { STARTERS } from "./starters";

afterEach(() => vi.unstubAllGlobals());
const A = { id: "ab12", kind: "image", type: "image/png", size: 3 };
const base = { kind: "color" as const, ref: "", opacity: 1, blur: 0 };

function setup(
  assets: unknown[] = [A],
  extra?: (m: string, u: string) => Response | undefined,
) {
  const f = vi.fn(async (u: string, init?: RequestInit) => {
    const m = init?.method ?? "GET";
    return (
      extra?.(m, u) ??
      (m === "GET" && u === "/api/assets" ? json(assets) : json(A, 201))
    );
  });
  vi.stubGlobal("fetch", f);
  const onChange = vi.fn();
  render(<BackgroundPicker value={base} onChange={onChange} />);
  return { f, onChange };
}

test("choosing a starter emits its layer, keeping opacity and blur", () => {
  const { onChange } = setup();
  const s = STARTERS[0];
  fireEvent.click(screen.getByRole("button", { name: s.label }));
  expect(onChange).toHaveBeenCalledWith({
    kind: s.kind,
    ref: s.ref,
    opacity: 1,
    blur: 0,
  });
});

test("sliders change opacity and blur", () => {
  const { onChange } = setup();
  fireEvent.change(screen.getByLabelText("Opacity"), {
    target: { value: "40" },
  });
  expect(onChange).toHaveBeenLastCalledWith({ ...base, opacity: 0.4 });
  fireEvent.change(screen.getByLabelText("Blur"), { target: { value: "6" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...base, blur: 6 });
});

test("uploads: drop a file, then pick it", async () => {
  const { f, onChange } = setup([]);
  fireEvent.click(screen.getByRole("radio", { name: "Uploads" }));
  const file = new File(["x"], "a.png", { type: "image/png" });
  fireEvent.drop(screen.getByTestId("dropzone"), {
    dataTransfer: { files: [file] },
  });
  await screen.findByRole("button", { name: "Use image ab12" });
  expect(f).toHaveBeenCalledWith(
    "/api/assets",
    expect.objectContaining({ method: "POST" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Use image ab12" }));
  expect(onChange).toHaveBeenCalledWith({
    ...base,
    kind: "image",
    ref: "ab12",
  });
});

test("paste a URL", async () => {
  const { f } = setup([]);
  fireEvent.click(screen.getByRole("radio", { name: "Uploads" }));
  fireEvent.change(screen.getByLabelText("Image URL"), {
    target: { value: "https://x.test/a.png" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
  await screen.findByRole("button", { name: "Use image ab12" });
  expect(f).toHaveBeenCalledWith("/api/assets/url", expect.anything());
});

test("Choose a file button opens the hidden input and uploads", async () => {
  const { f } = setup([]);
  fireEvent.click(screen.getByRole("radio", { name: "Uploads" }));
  const input = screen.getByLabelText("Choose a file") as HTMLInputElement;
  expect(input.tagName).toBe("INPUT");
  const click = vi.spyOn(input, "click");
  fireEvent.click(screen.getByRole("button", { name: "Choose a file" }));
  expect(click).toHaveBeenCalled();
  fireEvent.change(input, {
    target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
  });
  await screen.findByRole("button", { name: "Use image ab12" });
  expect(f).toHaveBeenCalledWith(
    "/api/assets",
    expect.objectContaining({ method: "POST" }),
  );
});

test("failed URL fetch keeps the pasted URL", async () => {
  setup([], (m, u) =>
    m === "POST" && u === "/api/assets/url"
      ? json({ error: "bad url" }, 400)
      : undefined,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Uploads" }));
  const box = screen.getByLabelText("Image URL") as HTMLInputElement;
  fireEvent.change(box, { target: { value: "https://x.test/a.png" } });
  fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
  await screen.findByRole("alert");
  expect(box.value).toBe("https://x.test/a.png");
});

test("upload failure shows the message", async () => {
  setup([], (m) =>
    m === "POST" ? json({ error: "asset too large" }, 413) : undefined,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Uploads" }));
  fireEvent.drop(screen.getByTestId("dropzone"), {
    dataTransfer: { files: [new File(["x"], "a.png")] },
  });
  expect((await screen.findByRole("alert")).textContent).toContain(
    "asset too large",
  );
});

test("delete asks to confirm", async () => {
  const { f } = setup([A], (m) =>
    m === "DELETE" ? new Response(null, { status: 204 }) : undefined,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Uploads" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete image ab12" }),
  );
  expect(f).not.toHaveBeenCalledWith("/api/assets/ab12", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Use image ab12" })).toBeNull(),
  );
  expect(f).toHaveBeenCalledWith(
    "/api/assets/ab12",
    expect.objectContaining({ method: "DELETE" }),
  );
});

test("gradient tab writes the allowlisted format", () => {
  const { onChange } = setup();
  fireEvent.click(screen.getByRole("radio", { name: "Gradient" }));
  fireEvent.change(screen.getByLabelText("Angle"), { target: { value: "90" } });
  const last = onChange.mock.calls.at(-1)![0];
  expect(last.kind).toBe("gradient");
  expect(last.ref).toMatch(
    /^linear-gradient\(90deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
  expect(onChange.mock.calls.at(-1)![0].ref.match(/%/g)).toHaveLength(3);
});
