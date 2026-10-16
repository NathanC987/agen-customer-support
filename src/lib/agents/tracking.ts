import { all, nowIso } from "@/lib/db";
import { addMessage, addTicketEvent, getConversation, getTicket, updateConversation, updateTicket } from "@/lib/db/repo";
import { HUMAN_AGENTS } from "@/lib/team";
import { slaState } from "./sla";
import type { Priority, Team, Ticket, TicketStatus } from "@/lib/types";

export const LIFECYCLE: TicketStatus[] = ["open", "assigned", "pending_customer", "resolved", "closed"];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Opened",
  assigned: "Assigned",
  pending_customer: "Pending customer",
  resolved: "Resolved",
  closed: "Closed",
};

const ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  open: ["assigned", "resolved", "closed"],
  assigned: ["pending_customer", "resolved", "open"],
  pending_customer: ["assigned", "resolved"],
  resolved: ["closed", "assigned"],
  closed: ["assigned"],
};

export const nextStatuses = (s: TicketStatus) => ALLOWED[s];

function notifyCustomer(t: Ticket, text: string) {
  if (!t.conversation_id) return;
  addMessage(t.conversation_id, "system", text, { ticketId: t.id, kind: "status_update" });
}

const CUSTOMER_UPDATE: Record<TicketStatus, (t: Ticket) => string> = {
  open: (t) => `Ticket #${t.id} has been re-opened and is back in the queue.`,
  assigned: (t) => `Good news — ${t.assignee ?? "a specialist"} is now working on ticket #${t.id}.`,
  pending_customer: (t) => `Ticket #${t.id} is waiting on your reply. Respond here and we'll pick it right back up.`,
  resolved: (t) => `Ticket #${t.id} has been resolved. Let us know how we did!`,
  closed: (t) => `Ticket #${t.id} is now closed.`,
};

/** Resolution Tracking Agent: validated status transitions with an audit trail and automatic customer updates. */
export function transitionTicket(id: number, to: TicketStatus, actor: string, note?: string) {
  const t = getTicket(id);
  if (!t) throw new Error("Ticket not found");
  if (t.status === to) return t;
  if (!ALLOWED[t.status].includes(to)) throw new Error(`Cannot move ticket from ${t.status} to ${to}`);

  const patch: Partial<Ticket> = { status: to, status_label: STATUS_LABEL[to] };
  if (to === "assigned" && !t.assignee) patch.assignee = HUMAN_AGENTS[t.team];
  if (to === "resolved") patch.resolved_at = nowIso();
  if (to === "assigned" && !t.first_response_at) patch.first_response_at = nowIso();
  updateTicket(id, patch);
  addTicketEvent({ ticket_id: id, type: "status", from_status: t.status, to_status: to, actor, note: note ?? null });

  const updated = getTicket(id)!;
  notifyCustomer(updated, CUSTOMER_UPDATE[to](updated));

  if (t.conversation_id) {
    const conv = getConversation(t.conversation_id);
    if (conv) {
      const lifecycle = to === "resolved" || to === "closed" ? "resolved" : "escalated";
      updateConversation(conv.id, {
        status: lifecycle,
        resolved_at: lifecycle === "resolved" ? (conv.resolved_at ?? nowIso()) : null,
        resolution_type: lifecycle === "resolved" ? "human" : null,
        issue_state: { ...conv.issue_state, lifecycle },
      });
    }
  }
  return updated;
}

export function assignTicket(id: number, assignee: string, actor: string) {
  const t = getTicket(id);
  if (!t) throw new Error("Ticket not found");
  updateTicket(id, { assignee });
  addTicketEvent({ ticket_id: id, type: "assigned", from_status: null, to_status: null, actor, note: `Assigned to ${assignee}` });
  if (t.status === "open") transitionTicket(id, "assigned", actor);
}

/** A human agent reply goes straight into the customer's chat. */
export function replyToTicket(id: number, agentName: string, text: string, awaitCustomer: boolean) {
  const t = getTicket(id);
  if (!t) throw new Error("Ticket not found");
  if (t.conversation_id) addMessage(t.conversation_id, "agent", text, { ticketId: id });
  addTicketEvent({ ticket_id: id, type: "reply", from_status: null, to_status: null, actor: agentName, note: text });
  if (!t.first_response_at) updateTicket(id, { first_response_at: nowIso() });
  if (t.status === "open") assignTicket(id, agentName, agentName);
  if (awaitCustomer) transitionTicket(id, "pending_customer", agentName);
}

/** Customer replied on an escalated case: record it and pull the ticket back from pending. */
export function onCustomerReply(t: Ticket, text: string) {
  addTicketEvent({ ticket_id: t.id, type: "note", from_status: null, to_status: null, actor: "Customer", note: text });
  if (t.status === "pending_customer") transitionTicket(t.id, "assigned", "Customer reply");
}

/** SLA monitor: auto-escalates at-risk tickets (bump to urgent, notify supervisor queue). */
export function sweepSla() {
  const open = all<Ticket & { tier: string }>(
    "SELECT t.*, c.tier FROM tickets t JOIN customers c ON c.id = t.customer_id WHERE t.status IN ('open','assigned') AND t.first_response_at IS NULL",
  );
  let escalated = 0;
  for (const t of open) {
    const state = slaState(t);
    if ((state === "at_risk" || state === "breached") && t.priority !== "urgent") {
      updateTicket(t.id, { priority: "urgent" as Priority });
      addTicketEvent({
        ticket_id: t.id,
        type: "sla",
        from_status: null,
        to_status: null,
        actor: "SLA Monitor",
        note: `SLA ${state === "breached" ? "breached" : "at risk"} — priority raised to urgent and duty supervisor notified`,
      });
      escalated++;
    }
  }
  return escalated;
}

export const teamAgents = Object.entries(HUMAN_AGENTS).map(([team, name]) => ({ team: team as Team, name }));

export function ticketStats(tickets: Ticket[], now = Date.now()) {
  const active = tickets.filter((t) => ["open", "assigned", "pending_customer"].includes(t.status));
  return {
    active: active.length,
    unassigned: active.filter((t) => t.status === "open").length,
    urgent: active.filter((t) => t.priority === "urgent").length,
    atRisk: active.filter((t) => ["at_risk", "breached"].includes(slaState(t, now))).length,
    resolvedToday: tickets.filter((t) => t.resolved_at && Date.parse(t.resolved_at) > now - 86_400_000).length,
  };
}
