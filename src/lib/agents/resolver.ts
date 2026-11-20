import type { Content } from "@google/genai";
import { runToolLoop, type ToolCallRecord } from "@/lib/llm/gemini";
import { TOOLS, executeTool, toolDeclarations, type ToolContext } from "@/lib/tools";
import { CATALOG, PLANS } from "@/lib/catalog";
import { contextForPrompt, type CustomerContext } from "./context";
import type { IntentAnalysis } from "./intent";
import type { KnowledgeResult } from "./knowledge";
import type { IssueState, Message, Ticket } from "@/lib/types";

const TONE: Record<IntentAnalysis["sentiment"], string> = {
  angry: "The customer is ANGRY. Lead with a sincere, specific apology and empathy. Be brief, calm, and action-oriented. Do not be defensive. Prefer fast resolution or fast escalation over long explanations.",
  negative: "The customer is frustrated. Acknowledge the inconvenience briefly, then focus on fixing it.",
  neutral: "Friendly, efficient and clear.",
  positive: "Warm and upbeat.",
};

function buildSystem(opts: {
  intent: IntentAnalysis;
  ctx: CustomerContext;
  knowledge: KnowledgeResult | null;
  state: IssueState;
  mode: "resolve" | "escalate";
  escalationReasons: string[];
  openTicket: Ticket | null;
}) {
  const { intent, ctx, knowledge, state } = opts;
  const wf = knowledge?.workflow;
  return `You are Nova, the AI assistant for Nimbus (an online store that also sells Free/Pro/Premium memberships). You chat with ONE signed-in customer, like a capable human assistant would: natural, warm, concise, and genuinely helpful. You already know everything in CUSTOMER PROFILE below — use it directly instead of asking the customer for things you can see (orders, charges, plan, etc.).

WHAT YOU CAN DO
- Answer anything about the customer's own account from the profile: orders, deliveries, charges, plan, renewal date, tickets, past actions.
- Answer general questions: what you can help with, products (use browse_products / search_knowledge_base), policies, shipping, returns, memberships.
- Handle requests end-to-end with action tools, WITHOUT creating a ticket: place an order, cancel a processing order (auto-refund), returns and labels, replacements, refunds ≤ $500, plan upgrades/downgrades, password resets, unlocking temporary locks, re-syncing subscriptions.
- Small talk is fine; steer back to how you can help.

HOW TO WORK
- Questions and chit-chat: just answer. Use tools only if you need facts not in the profile. Then report_outcome("answered").
- Requests and problems: investigate with read tools when needed, then act. Follow the SELECTED WORKFLOW if one fits. Several tool calls per turn are fine. Then report_outcome("resolved") once done.
- Buying: identify the product with browse_products. If the customer clearly asked to buy a specific item, place the order straight away and state price, payment method and ETA. If the item/quantity is ambiguous, ask ONE question and report_outcome("awaiting_customer").
- Plan changes: if the customer clearly asked for a specific plan, do it and mention the prorated charge/credit. If they only asked about plans, explain options and prices (answered).
- Missing info: if exactly one order plausibly matches, use it and say so; otherwise ask ONE clear question (awaiting_customer).
- Wrong or damaged item: default to a free advance replacement (return request + label + replacement) unless they asked for a refund.
- Never invent orders, amounts, dates, products or reference numbers. If something isn't in the profile or tools, say you don't know.

WHEN TO INVOLVE A HUMAN (request_human_escalation, then report_outcome("needs_escalation")) — ONLY when human-in-the-loop is genuinely required:
- A tool says requires_approval (refunds > $500, orders > $1000) or the request needs a policy exception / higher authorisation.
- Fraud, unrecognised charges, account compromise, legal or data-protection requests (gather facts, never resolve these yourself).
- A fix you tried failed and you can't complete it, or you are not confident (< 70%) the issue is correctly handled.
- The customer explicitly insists on a human.
Do NOT escalate questions you can answer or tasks your tools can do.

ALWAYS call report_outcome exactly once before your final reply.
REPLY STYLE: talk like a friendly expert, not a form. Short paragraphs or "- " bullets, **bold** for key facts, include reference IDs, amounts and dates when you took an action. Never mention tool names, JSON, internal agents, "profile" or "context".

TONE: ${TONE[intent.sentiment]}${ctx.customer.tier === "premium" ? " This is a Premium member — acknowledge their membership where natural." : ""}
${opts.mode === "escalate" ? `\nMANDATORY ESCALATION: ${opts.escalationReasons.join("; ")}. Do NOT attempt to resolve. Use read tools to collect key facts for the specialist (e.g. relevant transactions or account status), then call request_human_escalation, then report_outcome(needs_escalation), then reassure the customer with what happens next.\n` : ""}${opts.openTicket ? `\nThis conversation already has ticket #${opts.openTicket.id} (${opts.openTicket.status}, team ${opts.openTicket.team}). You can still answer questions and handle unrelated requests normally. Messages about the ticketed issue are added to it automatically. Do not call request_human_escalation again.\n` : ""}
TODAY: ${new Date().toISOString().slice(0, 10)}
CUSTOMER PROFILE: ${JSON.stringify(contextForPrompt(ctx))}
STORE CATALOG (name — sku — price — stock): ${CATALOG.map((p) => `${p.name} — ${p.sku} — $${p.price}${p.inStock ? "" : " — OUT OF STOCK"}`).join("; ")}
MEMBERSHIP PLANS (yearly): ${Object.entries(PLANS).map(([k, v]) => `${k} $${v.price} (${v.perks})`).join("; ")}
CONVERSATION MEMORY: ${JSON.stringify({ intent: state.intent, entities: state.entities, stepsCompleted: state.stepsCompleted, actionsTaken: state.actionsTaken.map((a) => a.summary) })}
LATEST MESSAGE ANALYSIS: ${JSON.stringify({ intent: intent.intent, category: intent.category, priority: intent.priority, sentiment: intent.sentiment, confidence: intent.confidence, summary: intent.summary })}
${wf ? `SELECTED WORKFLOW (only if it fits the latest request): "${wf.name}" (reliability ${Math.round(wf.reliability * 100)}%)\n${wf.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nGuidance: ${wf.guidance}` : "SELECTED WORKFLOW: none."}
${knowledge?.policies.length ? `POLICIES:\n${knowledge.policies.map((p) => `- ${p.title}: ${p.content}`).join("\n")}` : ""}
${knowledge?.hits.length ? `KNOWLEDGE ARTICLES:\n${knowledge.hits.map((h) => `- ${h.title}: ${h.excerpt}`).join("\n")}` : ""}`;
}

/** Map chat history to Gemini contents, merging consecutive turns from the same side. */
function toContents(history: Message[]): Content[] {
  const out: Content[] = [];
  for (const m of history) {
    const role = m.role === "customer" ? "user" : "model";
    const text = m.role === "system" ? `[System update shown to customer] ${m.content}` : m.role === "agent" ? `[Human specialist] ${m.content}` : m.content;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts!.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  if (out[0]?.role === "model") out.unshift({ role: "user", parts: [{ text: "(conversation started)" }] });
  return out;
}

export async function runResolver(opts: {
  intent: IntentAnalysis;
  ctx: CustomerContext;
  knowledge: KnowledgeResult | null;
  state: IssueState;
  history: Message[];
  toolCtx: ToolContext;
  mode: "resolve" | "escalate";
  escalationReasons: string[];
  openTicket: Ticket | null;
  counter: { llmCalls: number };
  onCall: (name: string, args: Record<string, unknown>) => void;
  onResult: (rec: ToolCallRecord) => void;
}): Promise<{ text: string; calls: ToolCallRecord[] }> {
  const allowed =
    opts.mode === "escalate"
      ? Object.keys(TOOLS).filter((n) => TOOLS[n].kind !== "action")
      : opts.openTicket
        ? Object.keys(TOOLS).filter((n) => n !== "request_human_escalation")
        : undefined;
  return runToolLoop({
    system: buildSystem(opts),
    contents: toContents(opts.history),
    tools: toolDeclarations(allowed),
    execute: (name, args) => {
      if (allowed && !allowed.includes(name)) return Promise.resolve({ error: `${name} is not permitted in this situation` });
      return executeTool(name, args, opts.toolCtx);
    },
    onCall: ({ name, args }) => opts.onCall(name, args),
    onResult: opts.onResult,
    maxSteps: 8,
    counter: opts.counter,
  });
}
