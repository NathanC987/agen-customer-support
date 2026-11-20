import { all, get } from "@/lib/db";
import { listKb } from "@/lib/db/repo";
import type { KbArticle } from "@/lib/types";
import { EMBED_DIM, embed, embedQuery } from "./embeddings";
import { COLLECTIONS, count, deletePoints, ensureCollection, pointId, recreateCollection, search, upsert } from "./qdrant";

/**
 * Retrieval-Augmented Generation over a real vector database (Qdrant).
 * - Knowledge base articles are split into overlapping, title-prefixed chunks and embedded with Gemini.
 * - Products are embedded from name/category/description; price & stock are always read live from SQL.
 */

export interface KbChunkPayload {
  article_id: string;
  title: string;
  type: KbArticle["type"];
  intents: string[];
  chunk: string;
  chunk_index: number;
}
export interface ProductPayload {
  sku: string;
  name: string;
  category: string;
}

const CHUNK_CHARS = 420;

/** Sentence-aware chunking with one sentence of overlap; each chunk carries its article title for context. */
export function chunkArticle(a: Pick<KbArticle, "title" | "content" | "tags" | "workflow">): string[] {
  const body = a.workflow ? `${a.content}\nSteps: ${a.workflow.steps.join("; ")}` : a.content;
  const sentences = body.match(/[^.!?\n]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [body];
  const chunks: string[] = [];
  let cur: string[] = [];
  for (const s of sentences) {
    if (cur.length && [...cur, s].join(" ").length > CHUNK_CHARS) {
      chunks.push(cur.join(" "));
      cur = [cur[cur.length - 1]]; // overlap
    }
    cur.push(s);
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks.map((c) => `${a.title}\n${c}\n(keywords: ${a.tags.join(", ")})`);
}

async function articlePoints(articles: KbArticle[]) {
  const items = articles.flatMap((a) => chunkArticle(a).map((text, i) => ({ a, text, i })));
  const vectors = await embed(items.map((x) => x.text), "RETRIEVAL_DOCUMENT");
  return items.map(({ a, text, i }, n) => ({
    id: pointId(`${a.id}#${i}`),
    vector: vectors[n],
    payload: { article_id: a.id, title: a.title, type: a.type, intents: a.intents, chunk: text, chunk_index: i } satisfies KbChunkPayload,
  }));
}

interface ProductRow {
  sku: string;
  name: string;
  category: string;
  description: string;
}
const productText = (p: ProductRow) => `${p.name}. Category: ${p.category}. ${p.description}`;

async function productPoints(rows: ProductRow[]) {
  const vectors = await embed(rows.map(productText), "RETRIEVAL_DOCUMENT");
  return rows.map((p, n) => ({ id: pointId(`product:${p.sku}`), vector: vectors[n], payload: { sku: p.sku, name: p.name, category: p.category } satisfies ProductPayload }));
}

/** Full rebuild (used by `npm run rag:index` and after seeding). */
export async function rebuildIndex() {
  const articles = listKb();
  await recreateCollection(COLLECTIONS.kb, EMBED_DIM);
  await upsert(COLLECTIONS.kb, await articlePoints(articles));
  const products = all<ProductRow>("SELECT sku, name, category, description FROM products WHERE active = 1");
  await recreateCollection(COLLECTIONS.products, EMBED_DIM);
  await upsert(COLLECTIONS.products, await productPoints(products));
  return { articles: articles.length, chunks: await count(COLLECTIONS.kb), products: await count(COLLECTIONS.products) };
}

/** Incremental: (re)index one published article, e.g. right after an admin publishes it. */
export async function indexArticle(articleId: string) {
  const a = listKb().find((x) => x.id === articleId);
  await ensureCollection(COLLECTIONS.kb, EMBED_DIM);
  await deletePoints(COLLECTIONS.kb, { must: [{ key: "article_id", match: { value: articleId } }] });
  if (a) await upsert(COLLECTIONS.kb, await articlePoints([a]));
}

/** Incremental: (re)index one product, e.g. right after an admin adds it. */
export async function indexProduct(sku: string) {
  const p = get<ProductRow>("SELECT sku, name, category, description FROM products WHERE sku = ?", sku);
  if (!p) return;
  await ensureCollection(COLLECTIONS.products, EMBED_DIM);
  await upsert(COLLECTIONS.products, await productPoints([p]));
}

export interface SemanticKbHit {
  article_id: string;
  title: string;
  type: KbArticle["type"];
  score: number;
  chunk: string;
}

/** Top articles for a query: chunk hits grouped per article (best chunk wins). */
export async function semanticKb(query: string, limit = 4): Promise<SemanticKbHit[]> {
  const hits = await search<KbChunkPayload>(COLLECTIONS.kb, await embedQuery(query), limit * 3);
  const best = new Map<string, SemanticKbHit>();
  for (const h of hits) {
    const cur = best.get(h.payload.article_id);
    if (!cur || h.score > cur.score)
      best.set(h.payload.article_id, { article_id: h.payload.article_id, title: h.payload.title, type: h.payload.type, score: h.score, chunk: h.payload.chunk });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function semanticProducts(query: string, limit = 6): Promise<{ sku: string; score: number }[]> {
  const hits = await search<ProductPayload>(COLLECTIONS.products, await embedQuery(query), limit);
  return hits.map((h) => ({ sku: h.payload.sku, score: h.score }));
}

export async function ragStatus(): Promise<{ ok: true; kbChunks: number; products: number } | { ok: false; error: string }> {
  try {
    return { ok: true, kbChunks: await count(COLLECTIONS.kb), products: await count(COLLECTIONS.products) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
