import { apiFetch, apiPost, apiUpload } from "../auth/api";

export interface Asset {
  id: string;
  kind: "image" | "video";
  type: string;
  size: number;
  width?: number;
  height?: number;
}

async function fail(r: Response): Promise<never> {
  let msg = `request failed (${r.status})`;
  try {
    const b = (await r.json()) as { error?: string };
    if (b.error) msg = b.error;
  } catch {
    /* keep default */
  }
  throw new Error(msg);
}

export async function listAssets(): Promise<Asset[]> {
  const r = await apiFetch("/api/assets");
  if (!r.ok) return fail(r);
  return ((await r.json()) as Asset[] | null) ?? [];
}

export async function uploadAsset(file: File): Promise<Asset> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await apiUpload("/api/assets", fd);
  if (!r.ok) return fail(r);
  return (await r.json()) as Asset;
}

export async function assetFromUrl(url: string): Promise<Asset> {
  const r = await apiPost("/api/assets/url", { url });
  if (!r.ok) return fail(r);
  return (await r.json()) as Asset;
}

export async function deleteAsset(id: string): Promise<void> {
  const r = await apiFetch(`/api/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) return fail(r);
}
