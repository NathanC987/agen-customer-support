import { connection } from "next/server";
import { getCustomerContext } from "@/lib/agents/context";
import { listConversations } from "@/lib/db/repo";
import { canAccessCustomer, logSecurityEvent, requireApiUser } from "@/lib/auth/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const auth = await requireApiUser(req);
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!canAccessCustomer(auth.user, id)) {
    logSecurityEvent({ type: "foreign_profile_access", customer_id: auth.user.customerId, severity: "high", detail: { requested: id.slice(0, 60) } });
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    return Response.json({ context: getCustomerContext(id), conversations: listConversations(id) });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
