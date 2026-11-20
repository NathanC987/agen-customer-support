import { seed } from "@/lib/db/seed";
import { all } from "@/lib/db";
import { rebuildIndex } from "@/lib/rag";

seed();
const counts = ["customers", "users", "products", "orders", "kb_articles", "conversations", "tickets", "csat"].map(
  (t) => `${t}: ${all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)[0].n}`,
);
console.log(`✓ Database seeded (${counts.join(", ")})`);

rebuildIndex()
  .then((r) => console.log(`✓ RAG index rebuilt in Qdrant (${r.chunks} KB chunks, ${r.products} products)`))
  .catch((e) => console.warn(`⚠ RAG index not rebuilt (${e instanceof Error ? e.message : e}). Start Qdrant with \`docker compose up -d\`, then run \`npm run rag:index\`. Keyword search is used until then.`));
