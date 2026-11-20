import { rebuildIndex } from "@/lib/rag";

const t0 = Date.now();
rebuildIndex()
  .then((r) => console.log(`✓ RAG index rebuilt in Qdrant: ${r.articles} articles → ${r.chunks} chunks, ${r.products} products (${((Date.now() - t0) / 1000).toFixed(1)}s)`))
  .catch((e) => {
    console.error(`✗ RAG indexing failed: ${e instanceof Error ? e.message : e}`);
    console.error("  Is Qdrant running (docker compose up -d) and GEMINI_API_KEY set in .env.local?");
    process.exit(1);
  });
