import type { Priority, Tier } from "@/lib/types";

const MIN = 60_000;

/** First-response target (minutes) after escalation. Premium always gets 15 minutes. */
export function responseTargetMinutes(tier: Tier, priority: Priority): number {
  if (tier === "premium") return 15;
  return { urgent: 30, high: 60, medium: 240, low: 1440 }[priority];
}

export function slaDueAt(fromMs: number, tier: Tier, priority: Priority): string {
  return new Date(fromMs + responseTargetMinutes(tier, priority) * MIN).toISOString();
}

export type SlaState = "met" | "on_track" | "at_risk" | "breached";

/** at_risk = less than 25% of the response window left without a first response. */
export function slaState(t: { created_at: string; sla_due_at: string; first_response_at: string | null; status: string }, now = Date.now()): SlaState {
  const due = Date.parse(t.sla_due_at);
  if (t.first_response_at) return Date.parse(t.first_response_at) <= due ? "met" : "breached";
  if (t.status === "resolved" || t.status === "closed") return "met";
  if (now > due) return "breached";
  const window = due - Date.parse(t.created_at);
  return due - now < window * 0.25 ? "at_risk" : "on_track";
}
