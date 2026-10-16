import { seed } from "@/lib/db/seed";
import { all } from "@/lib/db";

seed();
const counts = ["customers", "orders", "kb_articles", "conversations", "tickets", "csat"].map(
  (t) => `${t}: ${all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)[0].n}`,
);
console.log(`✓ Database seeded (${counts.join(", ")})`);
