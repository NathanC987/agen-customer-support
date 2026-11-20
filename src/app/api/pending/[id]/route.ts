import { z } from "zod";
import { addMessage, getConversation, updateConversation } from "@/lib/db/repo";
import { cancelPending, executePending, getPending } from "@/lib/commerce";
import { requireApiUser } from "@/lib/auth/session";

const Body = z.object({ decision: z.enum(["confirm", "cancel"]) });

/**
 * The customer's explicit consent for a quote (order / plan change). Only the owning, signed-in customer
 * can confirm, and executePending runs the action exactly once no matter how often this is called.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(req, "customer");
  if (auth.error) return auth.error;
  const customerId = auth.user.customerId!;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const pa = getPending(id);
  if (!pa || pa.customer_id !== customerId) return Response.json({ error: "Not found" }, { status: 404 });
  const conv = getConversation(pa.conversation_id);

  if (parsed.data.decision === "cancel") {
    if (!cancelPending(id, customerId)) return Response.json({ error: `This request is already ${getPending(id)?.status}` }, { status: 409 });
    const message = addMessage(pa.conversation_id, "assistant", "No problem — I've cancelled that request. Nothing was charged.", { kind: "confirmation" });
    return Response.json({ ok: true, status: "cancelled", message });
  }

  const res = executePending(id, customerId, "button");
  if (!res.success) return Response.json({ error: res.summary, already_done: Boolean(res.already_done) }, { status: 409 });

  const action = { action: pa.type, ref: res.ref, summary: res.summary };
  const message = addMessage(pa.conversation_id, "assistant", `Done! ${res.summary}.`, { actions: [action], kind: "confirmation" });
  if (conv) {
    const state = conv.issue_state;
    updateConversation(conv.id, {
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_type: "auto",
      summary: res.summary,
      issue_state: { ...state, lifecycle: "resolved", actionsTaken: [...state.actionsTaken, action], openQuestions: [] },
    });
  }
  return Response.json({ ok: true, status: "confirmed", result: res, message });
}
