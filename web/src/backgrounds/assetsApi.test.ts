import { afterEach, expect, test, vi } from "vitest";
import { json } from "../auth/testutil";
import {
  assetFromUrl,
  deleteAsset,
  listAssets,
  uploadAsset,
} from "./assetsApi";

afterEach(() => vi.unstubAllGlobals());
const stub = (r: Response) => {
  const f = vi.fn(async (..._a: unknown[]) => r.clone());
  vi.stubGlobal("fetch", f);
  return f;
};
const A = { id: "ab12", kind: "image", type: "image/png", size: 3 };

test("list", async () => {
  stub(json([A]));
  expect(await listAssets()).toEqual([A]);
});

test("upload sends multipart file field", async () => {
  const f = stub(json(A, 201));
  const file = new File(["x"], "a.png", { type: "image/png" });
  expect(await uploadAsset(file)).toEqual(A);
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/assets");
  expect(init.method).toBe("POST");
  expect((init.body as FormData).get("file")).toBeInstanceOf(File);
});

test("from url posts json", async () => {
  const f = stub(json(A, 201));
  await assetFromUrl("https://x.test/a.png");
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/assets/url");
  expect(init.body).toBe(JSON.stringify({ url: "https://x.test/a.png" }));
});

test("errors surface the server message", async () => {
  stub(json({ error: "unsupported content type" }, 415));
  await expect(uploadAsset(new File(["x"], "a.txt"))).rejects.toThrow(
    "unsupported content type",
  );
});

test("delete", async () => {
  const f = stub(new Response(null, { status: 204 }));
  await deleteAsset("ab12");
  expect((f.mock.calls[0] as [string, RequestInit])[1].method).toBe("DELETE");
});
