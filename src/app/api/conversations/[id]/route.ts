import { connection } from "next/server";
import { getConversation, getCsat, getTicketForConversation, listMessages, listRuns } from "@/lib/db/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    conversation,
    messages: listMessages(id),
    runs: listRuns(id),
    ticket: getTicketForConversation(id) ?? null,
    csat: getCsat(id) ?? null,
  });
}
