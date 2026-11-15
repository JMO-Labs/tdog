import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FontsSection } from "./FontsSection";
import * as api from "./fontsApi";

beforeEach(() => {
  vi.spyOn(api, "listFonts").mockResolvedValue([
    { family: "Hack Nerd Font", source: "nerd", styles: ["Regular"] },
  ]);
  vi.spyOn(api, "getPresetLigatures").mockResolvedValue(true);
  vi.spyOn(api, "listTerminalPresets").mockResolvedValue(["dev"]);
});
afterEach(() => vi.restoreAllMocks());

test("installed fonts show a live sample that follows the sample box", async () => {
  render(<FontsSection />);
  expect(await screen.findByText("Hack Nerd Font")).toBeTruthy();
  const sample = screen.getByTestId("sample-Hack Nerd Font");
  expect(sample.style.fontFamily).toContain("Hack Nerd Font");
  expect(sample.textContent).toContain("=>");
  fireEvent.change(screen.getByLabelText("Sample text"), {
    target: { value: "hello" },
  });
  expect(sample.textContent).toBe("hello");
});

test("browse searches and installs with plain-word progress", async () => {
  let done!: () => void;
  const inst = vi
    .spyOn(api, "installFont")
    .mockImplementation(() => new Promise<void>((r) => (done = r)));
  render(<FontsSection />);
  fireEvent.click(await screen.findByRole("tab", { name: "Browse" }));
  fireEvent.change(screen.getByLabelText("Search fonts"), {
    target: { value: "fira" },
  });
  const btn = screen.getAllByRole("button", { name: /^Install / })[0];
  fireEvent.click(btn);
  expect(await screen.findByText(/Installing/)).toBeTruthy();
  expect(inst).toHaveBeenCalled();
  done();
  await waitFor(() => expect(screen.getByText(/Installed/)).toBeTruthy());
});

test("install error is shown in words", async () => {
  vi.spyOn(api, "installFont").mockRejectedValue(new Error("download failed"));
  render(<FontsSection />);
  fireEvent.click(await screen.findByRole("tab", { name: "Browse" }));
  fireEvent.click(screen.getAllByRole("button", { name: /^Install / })[0]);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "download failed",
  );
});

test("upload rejects unsupported files, accepts dropped fonts", async () => {
  const up = vi.spyOn(api, "uploadFont").mockResolvedValue();
  render(<FontsSection />);
  fireEvent.click(await screen.findByRole("tab", { name: "Upload" }));
  const zone = screen.getByTestId("dropzone");
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(["x"], "a.txt")] },
  });
  expect((await screen.findByRole("alert")).textContent).toContain(".ttf");
  expect(up).not.toHaveBeenCalled();
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(["x"], "A-Regular.woff2")] },
  });
  await waitFor(() => expect(up).toHaveBeenCalledTimes(1));
});

test("apply to a preset and toggle ligatures", async () => {
  const ap = vi.spyOn(api, "applyFontToPreset").mockResolvedValue();
  render(<FontsSection />);
  await screen.findByText("Hack Nerd Font");
  fireEvent.change(screen.getByLabelText("Apply to"), {
    target: { value: "dev" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Use Hack Nerd Font" }));
  await waitFor(() =>
    expect(ap).toHaveBeenCalledWith("dev", { family: "Hack Nerd Font" }),
  );
  fireEvent.click(screen.getByRole("switch", { name: "Ligatures" }));
  await waitFor(() =>
    expect(ap).toHaveBeenCalledWith("dev", { ligatures: false }),
  );
});

test("ligatures switch reflects the selected preset", async () => {
  vi.spyOn(api, "getPresetLigatures").mockImplementation(
    async (n) => n !== "dev",
  );
  const ap = vi.spyOn(api, "applyFontToPreset").mockResolvedValue();
  render(<FontsSection />);
  await screen.findByText("Hack Nerd Font");
  fireEvent.change(screen.getByLabelText("Apply to"), {
    target: { value: "dev" },
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("switch", { name: "Ligatures" })
        .getAttribute("aria-checked"),
    ).toBe("false"),
  );
  fireEvent.click(screen.getByRole("switch", { name: "Ligatures" }));
  await waitFor(() =>
    expect(ap).toHaveBeenCalledWith("dev", { ligatures: true }),
  );
});

test("dropzone allows dragover and the file picker uploads chosen fonts", async () => {
  const up = vi.spyOn(api, "uploadFont").mockResolvedValue();
  const { container } = render(<FontsSection />);
  fireEvent.click(await screen.findByRole("tab", { name: "Upload" }));
  const zone = screen.getByTestId("dropzone");
  expect(fireEvent.dragOver(zone)).toBe(false); // default prevented
  const input = container.querySelector('input[type="file"]') as HTMLElement;
  fireEvent.change(input, {
    target: { files: [new File(["x"], "B-Regular.ttf")] },
  });
  await waitFor(() => expect(up).toHaveBeenCalledTimes(1));
});
