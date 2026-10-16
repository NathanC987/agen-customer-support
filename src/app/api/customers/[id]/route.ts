import { connection } from "next/server";
import { getCustomerContext } from "@/lib/agents/context";
import { listConversations } from "@/lib/db/repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  try {
    return Response.json({ context: getCustomerContext(id), conversations: listConversations(id) });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
