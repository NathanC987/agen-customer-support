import { z } from "zod";
import { generateJson, type ToolCallRecord } from "@/lib/llm/gemini";
import { addTicketEvent, insertTicket } from "@/lib/db/repo";
import { slaDueAt } from "./sla";
import type { CustomerContext } from "./context";
import type { EscalationDecision } from "./escalation";
import type { IntentAnalysis } from "./intent";
import type { IssueState, Message, Priority, Ticket } from "@/lib/types";

const TicketDraft = z.object({
  title: z.string(),
  issue: z.string(),
  investigation: z.array(z.string()),
  actions_taken: z.array(z.string()),
  recommended_next: z.string(),
  status_label: z.string(),
});
type TicketDraft = z.infer<typeof TicketDraft>;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short ticket title, max 70 chars" },
    issue: { type: "string", description: "One or two sentences: what the customer is experiencing" },
    investigation: { type: "array", items: { type: "string" }, description: "Verified findings from tool results, e.g. 'Payment successful (TXN-88231 captured)'" },
    actions_taken: { type: "array", items: { type: "string" }, description: "Actions the AI already performed" },
    recommended_next: { type: "string", description: "Concrete next step for the human specialist" },
    status_label: { type: "string", description: "Human-readable state such as 'Needs Engineering Review' or 'Awaiting Billing Approval'" },
  },
  required: ["title", "issue", "investigation", "actions_taken", "recommended_next", "status_label"],
};

const SYSTEM = `You are the Ticket Generation Agent. Write a complete, factual escalation ticket so the human agent never needs to reread the conversation.
Use ONLY facts from the transcript and the tool results. Include IDs (orders, transactions, references, error codes). Be concise.`;

const bump = (p: Priority): Priority => ({ low: "medium", medium: "high", high: "urgent", urgent: "urgent" } as const)[p];

function fallbackDraft(intent: IntentAnalysis, calls: ToolCallRecord[], decision: EscalationDecision, state: IssueState): TicketDraft {
  return {
    title: `${intent.intent.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())} — ${intent.summary.slice(0, 50)}`,
    issue: intent.summary,
    investigation: calls.filter((c) => !["report_outcome", "request_human_escalation"].includes(c.name)).map((c) => `${c.name}(${JSON.stringify(c.args)}) → ${JSON.stringify(c.result).slice(0, 140)}`),
    actions_taken: state.actionsTaken.map((a) => a.summary),
    recommended_next: "Review the findings and contact the customer.",
    status_label: `Needs ${decision.team.replace("_", " & ")} review`,
  };
}

export async function generateTicket(opts: {
  conversationId: string;
  ctx: CustomerContext;
  intent: IntentAnalysis;
  state: IssueState;
  history: Message[];
  calls: ToolCallRecord[];
  decision: EscalationDecision;
  counter: { llmCalls: number };
  llmAvailable: boolean;
}): Promise<{ ticket: Ticket; source: "llm" | "template" }> {
  const { ctx, intent, state, calls, decision } = opts;
  let draft: TicketDraft;
  let source: "llm" | "template" = "llm";
  try {
    if (!opts.llmAvailable) throw new Error("llm unavailable");
    const transcript = opts.history
      .filter((m) => m.role !== "system")
      .slice(-14)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
    const toolLog = calls
      .filter((c) => c.name !== "report_outcome")
      .map((c) => `- ${c.name} ${JSON.stringify(c.args)} => ${JSON.stringify(c.result).slice(0, 400)}`)
      .join("\n");
    const raw = await generateJson<unknown>({
      system: SYSTEM,
      contents: `CUSTOMER: ${ctx.customer.name} (${ctx.customer.tier}), ${ctx.highlights.previousTickets} previous tickets
INTENT: ${JSON.stringify({ intent: intent.intent, category: intent.category, priority: intent.priority, sentiment: intent.sentiment })}
ESCALATION REASONS: ${decision.reasons.join("; ")}
ACTIONS ALREADY TAKEN: ${state.actionsTaken.map((a) => a.summary).join("; ") || "none"}
TOOL RESULTS:
${toolLog || "(none)"}

TRANSCRIPT:
${transcript}`,
      schema: JSON_SCHEMA,
      counter: opts.counter,
    });
    draft = TicketDraft.parse(raw);
  } catch {
    draft = fallbackDraft(intent, calls, decision, state);
    source = "template";
  }

  let priority: Priority = intent.priority;
  if (ctx.customer.tier === "premium" && priority !== "urgent") priority = bump(priority);
  if (intent.sentiment === "angry" && priority !== "urgent") priority = bump(priority);

  const ticket = insertTicket({
    conversation_id: opts.conversationId,
    customer_id: ctx.customer.id,
    title: draft.title.slice(0, 90),
    issue: draft.issue,
    investigation: draft.investigation,
    actions_taken: draft.actions_taken.length ? draft.actions_taken : state.actionsTaken.map((a) => a.summary),
    recommended_next: draft.recommended_next,
    status: "open",
    status_label: draft.status_label,
    priority,
    category: intent.category,
    intent: intent.intent,
    sentiment: intent.sentiment,
    team: decision.team,
    assignee: null,
    escalation_reasons: decision.reasons,
    sla_due_at: slaDueAt(Date.now(), ctx.customer.tier, priority),
  });
  addTicketEvent({ ticket_id: ticket.id, type: "created", from_status: null, to_status: "open", actor: "AI Ticket Agent", note: `Escalated to ${decision.team.replace("_", " & ")} queue` });
  return { ticket, source };
}
