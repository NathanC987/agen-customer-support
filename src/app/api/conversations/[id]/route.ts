import { connection } from "next/server";
import { all } from "@/lib/db";
import { getConversation, getCsat, getTicketForConversation, listMessages, listRuns } from "@/lib/db/repo";
import { canAccessCustomer, requireApiUser } from "@/lib/auth/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;
  const { id } = await params;
  const conversation = getConversation(id);
  // 404 (not 403) so another customer's conversation ids can't even be confirmed to exist
  if (!conversation || !canAccessCustomer(auth.user, conversation.customer_id)) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    conversation,
    messages: listMessages(id),
    runs: listRuns(id),
    ticket: getTicketForConversation(id) ?? null,
    csat: getCsat(id) ?? null,
    pending: all<{ id: string; status: string }>("SELECT id, status FROM pending_actions WHERE conversation_id = ?", id),
  });
}
