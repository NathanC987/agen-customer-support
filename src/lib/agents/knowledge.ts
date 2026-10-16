import { listKb } from "@/lib/db/repo";
import type { Intent, KbArticle } from "@/lib/types";

const STOP = new Set("a an the i my me is it to of and or for on in was but be have has had with at this that not can you your we our do did does".split(" "));

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

export interface KbHit {
  id: string;
  title: string;
  type: KbArticle["type"];
  score: number;
  excerpt: string;
}

function score(article: KbArticle, terms: string[], intent: Intent | null): number {
  const title = tokenize(article.title);
  const tags = article.tags.flatMap(tokenize);
  const body = tokenize(article.content);
  let s = 0;
  for (const t of terms) {
    if (title.includes(t)) s += 3;
    if (tags.includes(t)) s += 2;
    s += Math.min(body.filter((b) => b === t).length, 3) * 0.5;
  }
  // phrase match on tags ("money deducted", "wrong item")
  const raw = terms.join(" ");
  for (const tag of article.tags) if (raw.includes(tag.toLowerCase())) s += 3;
  if (intent && article.intents.includes(intent)) s += 6;
  return s;
}

export function searchKb(query: string, intent: Intent | null = null, limit = 4): KbHit[] {
  const terms = tokenize(query);
  return listKb()
    .map((a) => ({ a, s: score(a, terms, intent) }))
    .filter((x) => x.s > 1)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map(({ a, s }) => ({ id: a.id, title: a.title, type: a.type, score: Math.round(s * 10) / 10, excerpt: a.content.slice(0, 280) }));
}

/**
 * Knowledge Base Agent: retrieves supporting articles AND selects the most reliable
 * workflow for the detected intent (not just the most similar text chunk).
 */
export function retrieveKnowledge(query: string, intent: Intent | null) {
  const all = listKb();
  const terms = tokenize(query);
  const hits = searchKb(query, intent, 4);
  const candidates = all
    .filter((a) => a.workflow)
    .map((a) => {
      const relevance = score(a, terms, intent);
      const intentMatch = intent ? a.intents.includes(intent) : false;
      // reliability-weighted: an exact intent match on a proven workflow beats a lexical match
      const rank = (intentMatch ? 10 : 0) + relevance * 0.5 + a.workflow!.reliability * 5;
      return { article: a, relevance, intentMatch, rank };
    })
    .filter((c) => c.intentMatch || c.relevance >= 5)
    .sort((x, y) => y.rank - x.rank);

  const selected = candidates[0]?.article ?? null;
  return {
    hits,
    workflow: selected
      ? { articleId: selected.id, title: selected.title, ...selected.workflow!, guidance: selected.content }
      : null,
    alternatives: candidates.slice(1, 3).map((c) => ({ id: c.article.id, title: c.article.title, rank: Math.round(c.rank * 10) / 10 })),
    policies: all
      .filter((a) => a.type === "policy" && intent && a.intents.includes(intent))
      .map((a) => ({ id: a.id, title: a.title, content: a.content })),
  };
}

export type KnowledgeResult = ReturnType<typeof retrieveKnowledge>;
