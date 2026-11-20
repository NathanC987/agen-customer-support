import { z } from "zod";
import { handleTurn, type OrchestratorEvent } from "@/lib/agents/orchestrator";
import { getConversation, getCustomer, messageExists } from "@/lib/db/repo";
import { logSecurityEvent, requireApiUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/rate-limit";

const Body = z.object({
  // customerId is deliberately NOT accepted: the customer is whoever the JWT says they are.
  conversationId: z.string().nullish(),
  message: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().uuid().optional(),
});

/** One turn at a time per customer: a double-submit can't run two agent turns (and two sets of actions) in parallel. */
const inFlight = new Set<string>();

export async function POST(req: Request) {
  const auth = await requireApiUser(req, "customer");
  if (auth.error) return auth.error;
  const customerId = auth.user.customerId;
  if (!customerId || !getCustomer(customerId)) return Response.json({ error: "No customer profile for this account" }, { status: 403 });

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { conversationId, message, clientMessageId } = parsed.data;

  if (raw && typeof raw === "object" && "customerId" in raw && raw.customerId !== customerId) {
    // someone tried to act as another customer — ignore the field, record the attempt
    logSecurityEvent({ type: "impersonation_attempt", customer_id: customerId, severity: "high", detail: { requested: String(raw.customerId).slice(0, 60) } });
  }
  if (conversationId) {
    const conv = getConversation(conversationId);
    if (!conv || conv.customer_id !== customerId) {
      logSecurityEvent({ type: "foreign_conversation_access", customer_id: customerId, conversation_id: conversationId, severity: "high", detail: {} });
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
  }
  if (clientMessageId && messageExists(clientMessageId)) return Response.json({ error: "Duplicate message — already processed" }, { status: 409 });
  if (!rateLimit(`chat:${customerId}`, 12, 60_000).ok) return Response.json({ error: "You're sending messages too quickly — wait a moment" }, { status: 429 });
  if (inFlight.has(customerId)) return Response.json({ error: "Still working on your previous message" }, { status: 409 });
  inFlight.add(customerId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: OrchestratorEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        await handleTurn({ customerId, conversationId, text: message, clientMessageId }, send);
      } catch (err) {
        console.error("[chat] turn failed", err);
        const dup = err instanceof Error && /UNIQUE constraint failed: messages\.client_id/.test(err.message);
        send({ type: "error", error: dup ? "Duplicate message — already processed" : err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        inFlight.delete(customerId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
