import type { Content } from "@google/genai";
import { runToolLoop, type ToolCallRecord } from "@/lib/llm/gemini";
import { TOOLS, executeTool, toolDeclarations, type ToolContext } from "@/lib/tools";
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
  return `You are Nova, the autonomous support agent for Nimbus (online store + Free/Pro/Premium memberships).
You act as the Troubleshooting Agent (investigate with read tools) and the Action Execution Agent (fix things with action tools). Behave like a senior support engineer: investigate before answering, act when policy allows, never guess.

RULES
- Verify facts with tools. Never invent orders, amounts, dates or reference numbers.
- Follow the SELECTED WORKFLOW in order; skip steps already completed (see ISSUE STATE). Do several tool calls per turn when possible.
- Missing information (e.g. which order)? First call list_recent_orders. If exactly one order plausibly matches, use it and mention it; otherwise ask ONE clear question.
- Wrong or damaged item: default to a free advance replacement (create return request + label + replacement order) unless the customer asked for a refund; mention they can switch to a refund.
- Refunds above $500, security locks, policy exceptions, or failed fixes → call request_human_escalation with the right team.
- Fraud, legal and data-breach issues must never be resolved by you: gather facts with read tools, then escalate.
- Only this customer's data is accessible; tools enforce that.
- ALWAYS call report_outcome exactly once before your final reply.
- Final reply to the customer: concise (2–6 sentences or a short bullet list), plain language, light markdown (**bold**, "- " bullets) allowed. Include reference IDs and timelines. Never mention tool names, JSON, or internal agents.

TONE: ${TONE[intent.sentiment]}${ctx.customer.tier === "premium" ? " This is a Premium member — acknowledge their membership where natural." : ""}
${opts.mode === "escalate" ? `\nMANDATORY ESCALATION: ${opts.escalationReasons.join("; ")}. Do NOT attempt to resolve. Use read tools to collect key facts for the specialist (e.g. relevant transactions or account status), then call request_human_escalation, then report_outcome(needs_escalation), then reassure the customer with what happens next.\n` : ""}${opts.openTicket ? `\nThis case is already escalated as ticket #${opts.openTicket.id} (${opts.openTicket.status}, team ${opts.openTicket.team}). Answer what you can and tell the customer their message was added to the ticket. Do not call request_human_escalation again.\n` : ""}
CUSTOMER CONTEXT: ${JSON.stringify(contextForPrompt(ctx))}
ISSUE STATE (memory): ${JSON.stringify({ intent: state.intent, entities: state.entities, stepsCompleted: state.stepsCompleted, actionsTaken: state.actionsTaken.map((a) => a.summary) })}
INTENT ANALYSIS: ${JSON.stringify({ intent: intent.intent, category: intent.category, priority: intent.priority, sentiment: intent.sentiment, confidence: intent.confidence, summary: intent.summary })}
${wf ? `SELECTED WORKFLOW: "${wf.name}" (reliability ${Math.round(wf.reliability * 100)}%)\n${wf.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nGuidance: ${wf.guidance}` : "SELECTED WORKFLOW: none — answer from knowledge or ask a clarifying question."}
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
    maxSteps: 6,
    counter: opts.counter,
  });
}
