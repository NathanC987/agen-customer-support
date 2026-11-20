import { ai } from "@/lib/llm/gemini";

/** Gemini text embeddings for the RAG pipeline. */
export const EMBED_MODEL = () => process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
export const EMBED_DIM = 768;

type Task = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const queryCache = new Map<string, number[]>();

function normalise(v: number[]): number[] {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export async function embed(texts: string[], task: Task): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const res = await ai().models.embedContent({
      model: EMBED_MODEL(),
      contents: batch,
      config: { taskType: task, outputDimensionality: EMBED_DIM },
    });
    const vectors = res.embeddings?.map((e) => e.values ?? []) ?? [];
    if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBED_DIM)) throw new Error("Embedding response had the wrong shape");
    // truncated (Matryoshka) gemini-embedding vectors must be re-normalised for cosine/dot similarity
    out.push(...vectors.map(normalise));
  }
  return out;
}

/** Query embeddings are cached in-process: repeated questions cost no API calls. */
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase().slice(0, 500);
  const hit = queryCache.get(key);
  if (hit) return hit;
  const [v] = await embed([key], "RETRIEVAL_QUERY");
  if (queryCache.size > 500) queryCache.delete(queryCache.keys().next().value!);
  queryCache.set(key, v);
  return v;
}
