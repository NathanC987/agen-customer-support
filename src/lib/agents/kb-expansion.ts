import { z } from "zod";
import { generateJson } from "@/lib/llm/gemini";
import { newId } from "@/lib/db";
import { getConversation, insertKb, listMessages } from "@/lib/db/repo";
import { INTENTS } from "@/lib/types";

const Draft = z.object({
  title: z.string(),
  tags: z.array(z.string()),
  intent: z.enum(INTENTS),
  content: z.string(),
});

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "FAQ-style question title" },
    tags: { type: "array", items: { type: "string" }, description: "3-6 search keywords" },
    intent: { type: "string", enum: [...INTENTS] },
    content: { type: "string", description: "Generalised answer (no personal data, no specific IDs), 60-120 words" },
  },
  required: ["title", "tags", "intent", "content"],
};

/** Auto Knowledge Base Expansion: turns a resolved conversation into a draft FAQ article. */
export async function draftArticleFromConversation(conversationId: string) {
  const conv = getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const transcript = listMessages(conversationId)
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
  const raw = await generateJson<unknown>({
    system:
      "You write help-center articles. Generalise the resolved support conversation into a reusable FAQ entry. Remove all personal data, names and specific order/transaction IDs.",
    contents: `Actions taken: ${conv.issue_state.actionsTaken.map((a) => a.summary).join("; ") || "none"}\n\n${transcript}`,
    schema: SCHEMA,
  });
  const d = Draft.parse(raw);
  const id = newId("kb");
  insertKb({ id, title: d.title, type: "faq", tags: d.tags, intents: [d.intent], content: d.content, workflow: null, source: "auto", status: "draft" });
  return id;
}
