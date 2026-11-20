import { LlmUnavailableError, llmConfigured, type ToolCallRecord } from "@/lib/llm/gemini";
import {
  addMessage,
  addTicketEvent,
  createConversation,
  getConversation,
  getTicketForConversation,
  saveRun,
  updateConversation,
} from "@/lib/db/repo";
import { TOOLS, isActionResult, type ToolContext } from "@/lib/tools";
import { TEAM_LABEL } from "@/lib/team";
import { getCustomerContext } from "./context";
import { postEscalationCheck, preEscalationCheck, type EscalationDecision } from "./escalation";
import { detectIntent, heuristicIntent, type IntentAnalysis } from "./intent";
import { retrieveKnowledge, type KnowledgeResult } from "./knowledge";
import { loadMemory, mergeIntent } from "./memory";
import { runResolver } from "./resolver";
import { responseTargetMinutes } from "./sla";
import { generateTicket } from "./ticket";
import { onCustomerReply } from "./tracking";
import type { AgentName, Conversation, ConversationStatus, Message, Ticket, TraceStep } from "@/lib/types";

export type OrchestratorEvent =
  | { type: "conversation"; conversation: Conversation }
  | { type: "user_message"; message: Message }
  | { type: "step"; step: TraceStep }
  | { type: "message"; message: Message }
  | { type: "ticket"; ticket: Ticket }
  | { type: "done"; runId: string; llmCalls: number; durationMs: number }
  | { type: "error"; error: string };

type Emit = (e: OrchestratorEvent) => void;

function tracer(emit: Emit) {
  const steps: TraceStep[] = [];
  let seq = 0;
  return {
    steps,
    start(agent: AgentName, title: string, data?: unknown): TraceStep {
      const step: TraceStep = { id: `s${++seq}`, agent, title, status: "running", startedAt: Date.now(), data };
      steps.push(step);
      emit({ type: "step", step: { ...step } });
      return step;
    },
    finish(step: TraceStep, patch: { summary?: string; data?: unknown; status?: TraceStep["status"] }) {
      Object.assign(step, { status: "done", ...patch, durationMs: Date.now() - step.startedAt });
      emit({ type: "step", step: { ...step } });
    },
    skip(agent: AgentName, title: string, summary: string) {
      const step: TraceStep = { id: `s${++seq}`, agent, title, status: "skipped", summary, startedAt: Date.now(), durationMs: 0 };
      steps.push(step);
      emit({ type: "step", step: { ...step } });
    },
  };
}

/** Low-stakes intents: if the LLM is down we answer from the knowledge base instead of opening a ticket. */
const SELF_SERVE = new Set(["greeting", "general_inquiry", "product_question", "feedback", "place_order", "order_status", "account_update", "plan_change"]);

const fallbackReason = (e: unknown) =>
  e instanceof LlmUnavailableError ? (e.reason === "no_key" ? "no Gemini API key configured" : e.reason === "rate_limited" ? "Gemini rate limit reached" : "Gemini error") : "unexpected error";

/**
 * Master Orchestrator: coordinates the specialised agents for one customer turn.
 * Intent → Memory → Context → Escalation pre-check → Knowledge → Troubleshoot/Act → Escalation post-check → Ticket → Track.
 */
export async function handleTurn(input: { customerId: string; conversationId?: string | null; text: string }, emit: Emit) {
  const t0 = Date.now();
  const counter = { llmCalls: 0 };
  const trace = tracer(emit);
  let llmAvailable = llmConfigured();

  // ---- conversation + persist customer message ----
  let conversation = input.conversationId ? getConversation(input.conversationId) : undefined;
  if (!conversation || conversation.customer_id !== input.customerId) conversation = createConversation(input.customerId);
  const conversationId = conversation.id;
  emit({ type: "conversation", conversation });
  const userMessage = addMessage(conversationId, "customer", input.text);
  emit({ type: "user_message", message: userMessage });

  // ---- 6. Conversation Memory Agent ----
  const memStep = trace.start("memory", "Recalling conversation");
  const { history, state: prevState } = loadMemory(conversationId);
  const existingTicket = getTicketForConversation(conversationId);
  const openTicket = existingTicket && !["resolved", "closed"].includes(existingTicket.status) ? existingTicket : null;
  if (openTicket) onCustomerReply(openTicket, input.text);
  trace.finish(memStep, {
    summary: prevState.turns
      ? `${history.length - 1} prior messages · tracking "${prevState.intent?.replace(/_/g, " ")}"${Object.keys(prevState.entities).length ? ` · knows ${Object.entries(prevState.entities).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}`
      : "New conversation",
    data: { previous: prevState, openTicket: openTicket ? { id: openTicket.id, status: openTicket.status } : null },
  });

  // ---- 1. Intent Detection Agent ----
  const intentStep = trace.start("intent", "Understanding the issue");
  let intent: IntentAnalysis;
  try {
    if (!llmAvailable) throw new LlmUnavailableError("no key", "no_key");
    intent = await detectIntent(history.slice(0, -1), input.text, prevState, counter);
    trace.finish(intentStep, {
      summary: `${intent.intent.replace(/_/g, " ")} · ${intent.priority} priority · ${intent.sentiment} · ${Math.round(intent.confidence * 100)}% confident`,
      data: intent,
    });
  } catch (e) {
    llmAvailable = false;
    intent = heuristicIntent(input.text, prevState);
    trace.finish(intentStep, { summary: `${intent.intent.replace(/_/g, " ")} (heuristic fallback — ${fallbackReason(e)})`, data: intent, status: "error" });
  }
  const state = mergeIntent(prevState, intent);
  if (state.intent !== intent.intent) intent = { ...intent, intent: state.intent!, category: state.category! };

  // ---- 2. Customer Context Agent ----
  const ctxStep = trace.start("context", "Fetching customer context");
  const ctx = getCustomerContext(input.customerId);
  trace.finish(ctxStep, {
    summary: `${ctx.customer.tier === "premium" ? "Premium" : "Standard"} customer · ${ctx.highlights.previousTickets} previous tickets · ${ctx.orders.length} recent orders`,
    data: { highlights: ctx.highlights, account: ctx.account, subscription: ctx.subscription, recentOrders: ctx.orders.slice(0, 3).map((o) => ({ id: o.id, status: o.status, total: o.total })) },
  });

  // ---- 7a. Escalation Decision Agent (pre-check) ----
  const preStep = trace.start("escalation", "Escalation pre-check");
  const pre = preEscalationCheck(intent, ctx, state);
  trace.finish(preStep, {
    summary: pre.decision === "escalate" ? `Must escalate → ${TEAM_LABEL[pre.team]}: ${pre.reasons[0]}` : "Safe to attempt autonomous resolution",
    data: pre,
  });
  const mode = pre.decision === "escalate" && !openTicket ? "escalate" : "resolve";

  // ---- 3. Knowledge Base Agent ----
  let knowledge: KnowledgeResult | null = null;
  const kbStep = trace.start("knowledge", "Searching knowledge base");
  knowledge = retrieveKnowledge(`${input.text} ${intent.summary}`, intent.intent);
  trace.finish(kbStep, {
    summary: knowledge.workflow
      ? `Selected workflow "${knowledge.workflow.name}" (${Math.round(knowledge.workflow.reliability * 100)}% reliable) · ${knowledge.hits.length} articles`
      : `${knowledge.hits.length} relevant articles · no workflow match`,
    data: knowledge,
  });

  // ---- 4/5. Troubleshooting + Action Execution Agents ----
  const toolCtx: ToolContext = { customerId: input.customerId, conversationId, intent: intent.intent, escalation: null, outcome: null };
  let calls: ToolCallRecord[] = [];
  let replyText = "";
  const pending = new Map<string, TraceStep[]>();
  if (llmAvailable) {
    const planStep = trace.start("orchestrator", mode === "escalate" ? "Collecting facts for specialist" : "Planning resolution");
    try {
      const res = await runResolver({
        intent,
        ctx,
        knowledge,
        state,
        history,
        toolCtx,
        mode,
        escalationReasons: pre.reasons,
        openTicket,
        counter,
        onCall: (name, args) => {
          const tool = TOOLS[name];
          if (!tool || name === "report_outcome") return;
          const agent: AgentName = tool.kind === "action" ? "action" : tool.kind === "control" ? "escalation" : "troubleshooting";
          const step = trace.start(agent, tool.label, { tool: name, args });
          pending.set(name, [...(pending.get(name) ?? []), step]);
        },
        onResult: (rec) => {
          const step = pending.get(rec.name)?.shift();
          if (!step) return;
          const r = rec.result as Record<string, unknown> | null;
          const failed = r && typeof r === "object" && ("error" in r || r.success === false);
          trace.finish(step, {
            summary: isActionResult(rec.result) ? rec.result.summary : failed ? String(r!.error ?? r!.summary) : summarizeRead(rec),
            data: { tool: rec.name, args: rec.args, result: rec.result },
            status: failed ? "error" : "done",
          });
        },
      });
      calls = res.calls;
      replyText = res.text;
      trace.finish(planStep, { summary: `${calls.length} tool calls · ${counter.llmCalls} LLM calls so far` });
    } catch (e) {
      llmAvailable = false;
      trace.finish(planStep, { summary: `Reasoning unavailable (${fallbackReason(e)}) — failing safe to a human`, status: "error" });
      for (const steps of pending.values()) for (const s of steps) trace.finish(s, { status: "error", summary: "interrupted" });
    }
  } else {
    trace.skip("troubleshooting", "Troubleshooting", "Skipped — LLM unavailable, failing safe to a human specialist");
  }

  // fold actions into memory
  const actions = calls.filter((c) => isActionResult(c.result)).map((c) => {
    const r = c.result as { summary: string; ref?: string };
    return { action: c.name, ref: r.ref, summary: r.summary };
  });
  state.actionsTaken = [...state.actionsTaken, ...actions.filter((a) => !state.actionsTaken.some((x) => x.summary === a.summary))];
  state.stepsCompleted = [...new Set([...state.stepsCompleted, ...calls.filter((c) => TOOLS[c.name]?.kind !== "control").map((c) => TOOLS[c.name]?.label ?? c.name)])];

  // ---- 7b. Escalation Decision Agent (post-check) ----
  let decision: EscalationDecision;
  const selfServeFallback = !llmAvailable && !openTicket && pre.decision !== "escalate" && SELF_SERVE.has(intent.intent);
  if (selfServeFallback) {
    decision = { decision: "auto_resolve", team: pre.team, reasons: ["AI reasoning unavailable — low-stakes question answered from the knowledge base"], signals: {} };
  } else if (!llmAvailable && !openTicket) {
    decision = { decision: "escalate", team: pre.team, reasons: [...pre.reasons, "AI reasoning unavailable — fail-safe escalation"], signals: {} };
  } else if (mode === "escalate") {
    decision = { ...pre, team: toolCtx.escalation?.team ?? pre.team };
  } else {
    const postStep = trace.start("escalation", "Escalation decision");
    decision = postEscalationCheck(intent, toolCtx);
    if (openTicket) decision = { ...decision, decision: "auto_resolve" };
    trace.finish(postStep, {
      summary:
        decision.decision === "escalate"
          ? `Escalate → ${TEAM_LABEL[decision.team]}: ${decision.reasons[0]}`
          : openTicket
            ? `Already escalated (ticket #${openTicket.id}) — message added to ticket`
            : toolCtx.outcome?.status === "resolved"
              ? `Auto-resolved · confidence ${Math.round((toolCtx.outcome.confidence ?? 0) * 100)}%`
              : toolCtx.outcome?.status === "answered"
                ? "Question answered — no human needed"
                : "Waiting on customer — no escalation needed",
      data: { ...decision, outcome: toolCtx.outcome },
    });
  }

  // ---- 8. Ticket Generation Agent ----
  let ticket: Ticket | null = null;
  if (decision.decision === "escalate" && !openTicket) {
    const ticketStep = trace.start("ticket", "Generating support ticket");
    const res = await generateTicket({ conversationId, ctx, intent, state, history, calls, decision, counter, llmAvailable });
    ticket = res.ticket;
    trace.finish(ticketStep, {
      summary: `Ticket #${ticket.id} · ${ticket.priority} · ${TEAM_LABEL[ticket.team]} · SLA ${responseTargetMinutes(ctx.customer.tier, ticket.priority)} min${res.source === "template" ? " (template)" : ""}`,
      data: ticket,
    });
    emit({ type: "ticket", ticket });
    const slaStep = trace.start("sla", "SLA monitoring");
    trace.finish(slaStep, { summary: `First response due by ${new Date(ticket.sla_due_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, data: { due: ticket.sla_due_at } });
  } else if (openTicket && actions.length) {
    addTicketEvent({ ticket_id: openTicket.id, type: "note", from_status: null, to_status: null, actor: "AI Agent", note: `Actions taken: ${actions.map((a) => a.summary).join("; ")}` });
  }

  // ---- compose reply ----
  if (!replyText && selfServeFallback) {
    const top = knowledge?.hits[0];
    replyText = top
      ? `I'm having a little trouble thinking this through right now, but here's what I found in our help centre:\n\n**${top.title}** — ${top.excerpt}\n\nIf that doesn't answer it, send your message again in a minute and I'll take care of it.`
      : "I'm having a little trouble right now — could you send that again in a minute? I can help with orders, refunds, returns, your plan, account access and product questions.";
  }
  if (!replyText) {
    replyText = ticket
      ? `I'm sorry for the trouble. I've passed this to our ${TEAM_LABEL[ticket.team]} team with everything we've discussed, so you won't need to repeat yourself. Your ticket is **#${ticket.id}** and a specialist will respond within ${responseTargetMinutes(ctx.customer.tier, ticket.priority)} minutes.`
      : openTicket
        ? `Thanks — I've added this to ticket #${openTicket.id}. ${openTicket.assignee ?? "A specialist"} will follow up here shortly.`
        : "Could you share a bit more detail (for example your order ID) so I can look into this?";
  } else if (ticket && !replyText.includes(`#${ticket.id}`)) {
    replyText += `\n\nYour ticket number is **#${ticket.id}** — a ${TEAM_LABEL[ticket.team]} specialist will respond within ${responseTargetMinutes(ctx.customer.tier, ticket.priority)} minutes.`;
  }

  // ---- 9. lifecycle update (Resolution Tracking) ----
  const outcomeStatus = toolCtx.outcome?.status;
  const status: ConversationStatus =
    ticket || openTicket
      ? "escalated"
      : outcomeStatus === "resolved"
        ? "resolved"
        : outcomeStatus === "answered" || selfServeFallback || (!outcomeStatus && replyText && !replyText.trim().endsWith("?"))
          ? // a plain Q&A turn keeps an already-resolved issue resolved; otherwise the chat just stays open
            prevState.lifecycle === "resolved" ? "resolved" : "active"
          : "awaiting_customer";
  state.lifecycle = status;
  state.openQuestions = status === "awaiting_customer" ? [replyText.split("\n").pop()!.slice(0, 160)] : [];
  updateConversation(conversationId, {
    status,
    intent: intent.intent,
    category: intent.category,
    priority: ticket?.priority ?? intent.priority,
    sentiment: intent.sentiment,
    confidence: toolCtx.outcome?.confidence ?? intent.confidence,
    summary: toolCtx.outcome?.summary || intent.summary,
    issue_state: state,
    resolved_at: status === "resolved" ? (prevState.lifecycle === "resolved" && outcomeStatus !== "resolved" ? conversation.resolved_at : new Date().toISOString()) : null,
    resolution_type: status === "resolved" ? (prevState.lifecycle === "resolved" ? (conversation.resolution_type ?? "auto") : "auto") : null,
  });

  const respStep = trace.start("response", "Responding to customer");
  const assistant = addMessage(conversationId, "assistant", replyText, { actions, ticketId: ticket?.id ?? openTicket?.id });
  trace.finish(respStep, { summary:
      status === "escalated"
        ? "Customer informed of escalation"
        : outcomeStatus === "resolved"
          ? "Resolved without a ticket — CSAT survey offered"
          : status === "awaiting_customer"
            ? "Asked customer for next input"
            : "Answered — no ticket needed", data: { outcome: toolCtx.outcome } });

  const durationMs = Date.now() - t0;
  const runId = saveRun({ conversation_id: conversationId, message_id: assistant.id, steps: trace.steps, llm_calls: counter.llmCalls, duration_ms: durationMs });
  emit({ type: "message", message: assistant });
  emit({ type: "conversation", conversation: getConversation(conversationId)! });
  emit({ type: "done", runId, llmCalls: counter.llmCalls, durationMs });
}

function summarizeRead(rec: ToolCallRecord): string {
  const r = rec.result as Record<string, unknown> | unknown[];
  if (Array.isArray(r)) {
    const anomalies = r.filter((x) => (x as { anomaly?: string }).anomaly).length;
    return `${r.length} records${anomalies ? ` · ${anomalies} anomal${anomalies > 1 ? "ies" : "y"} flagged` : ""}`;
  }
  switch (rec.name) {
    case "get_order":
      return `${r.id} · ${r.status} · $${r.total}`;
    case "get_shipment":
      return `${r.carrier ?? ""} ${r.status}`.trim();
    case "compare_order_items":
      return r.match ? "Items match the order" : "Mismatch: delivered item differs from order";
    case "check_return_eligibility":
      return r.eligible ? `Eligible — ${r.policy}` : `Not eligible — ${r.reason}`;
    case "get_account_status":
      return `${r.status} · ${r.failed_login_attempts} failed attempts${r.lock_reason ? ` · ${r.lock_reason}` : ""}`;
    case "get_subscription":
      return `${r.plan} · ${r.status} · sync ${r.sync_status}`;
    case "request_human_escalation":
      return `Resolver requested escalation (${String((rec.args as { team?: string }).team ?? "")})`;
    default:
      return "Done";
  }
}
