import { newId, nowIso, run } from "@/lib/db";
import { getConversation, getCsat } from "@/lib/db/repo";

const NEGATIVE = /not|never|bad|slow|terrible|awful|useless|didn'?t|still|worst|annoy/i;
const POSITIVE = /great|thanks|thank you|quick|fast|helpful|awesome|perfect|love|excellent/i;

/** Customer Satisfaction Agent: records CSAT, infers comment sentiment and resolution quality. */
export function submitCsat(conversationId: string, rating: number, comment: string | null) {
  const conv = getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (getCsat(conversationId)) return getCsat(conversationId)!;
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  const text = comment?.trim() || null;
  let sentiment = r >= 4 ? "positive" : r === 3 ? "neutral" : "negative";
  if (text && NEGATIVE.test(text) && !POSITIVE.test(text)) sentiment = r >= 4 ? "neutral" : "negative";
  if (text && POSITIVE.test(text) && r >= 3) sentiment = "positive";
  const quality = r >= 4 ? "resolved" : r === 3 ? "partially_resolved" : "unresolved";
  run(
    "INSERT INTO csat (id, conversation_id, customer_id, rating, comment, sentiment, resolution_quality, created_at) VALUES (?,?,?,?,?,?,?,?)",
    newId("csat"),
    conversationId,
    conv.customer_id,
    r,
    text,
    sentiment,
    quality,
    nowIso(),
  );
  return getCsat(conversationId)!;
}
