import { z } from "zod";
import { handleTurn, type OrchestratorEvent } from "@/lib/agents/orchestrator";
import { getCustomer } from "@/lib/db/repo";

const Body = z.object({
  customerId: z.string().min(1),
  conversationId: z.string().nullish(),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { customerId, conversationId, message } = parsed.data;
  if (!getCustomer(customerId)) return Response.json({ error: "Unknown customer" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: OrchestratorEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        await handleTurn({ customerId, conversationId, text: message }, send);
      } catch (err) {
        console.error("[chat] turn failed", err);
        send({ type: "error", error: err instanceof Error ? err.message : "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
