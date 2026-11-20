import { createHash } from "node:crypto";

/** Minimal Qdrant REST client (https://qdrant.tech/documentation/) — no SDK needed. */
const base = () => (process.env.QDRANT_URL || "http://127.0.0.1:6333").replace(/\/$/, "");

export const COLLECTIONS = { kb: "nimbus_kb", products: "nimbus_products" } as const;

async function q<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(process.env.QDRANT_API_KEY ? { "api-key": process.env.QDRANT_API_KEY } : {}) },
    signal: AbortSignal.timeout(init?.timeoutMs ?? 4000),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { result?: T; status?: { error?: string } };
  if (!res.ok) throw new Error(`Qdrant ${init?.method ?? "GET"} ${path} → ${res.status} ${body.status?.error ?? ""}`.trim());
  return body.result as T;
}

/** Qdrant point ids must be UUIDs or integers — derive a stable UUID from our string id. */
export function pointId(key: string): string {
  const h = createHash("sha1").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function recreateCollection(name: string, dim: number) {
  await q(`/collections/${name}`, { method: "DELETE" }).catch(() => undefined);
  await q(`/collections/${name}`, { method: "PUT", body: JSON.stringify({ vectors: { size: dim, distance: "Cosine" } }) });
}

export async function ensureCollection(name: string, dim: number) {
  const exists = await q<{ exists: boolean }>(`/collections/${name}/exists`);
  if (!exists.exists) await q(`/collections/${name}`, { method: "PUT", body: JSON.stringify({ vectors: { size: dim, distance: "Cosine" } }) });
}

export interface Point<P> {
  id: string;
  vector: number[];
  payload: P;
}

export async function upsert<P>(name: string, points: Point<P>[]) {
  if (points.length) await q(`/collections/${name}/points?wait=true`, { method: "PUT", body: JSON.stringify({ points }), timeoutMs: 20000 });
}

export async function deletePoints(name: string, filter: object) {
  await q(`/collections/${name}/points/delete?wait=true`, { method: "POST", body: JSON.stringify({ filter }) });
}

export interface Hit<P> {
  id: string;
  score: number;
  payload: P;
}

export async function search<P>(name: string, vector: number[], limit: number, filter?: object): Promise<Hit<P>[]> {
  return q<Hit<P>[]>(`/collections/${name}/points/search`, {
    method: "POST",
    body: JSON.stringify({ vector, limit, with_payload: true, ...(filter ? { filter } : {}) }),
  });
}

export async function count(name: string): Promise<number> {
  const r = await q<{ count: number }>(`/collections/${name}/points/count`, { method: "POST", body: JSON.stringify({ exact: true }) });
  return r.count;
}
