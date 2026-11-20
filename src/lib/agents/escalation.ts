import type { IntentAnalysis } from "./intent";
import type { CustomerContext } from "./context";
import type { Intent, IssueState, Team } from "@/lib/types";

export const CONFIDENCE_THRESHOLD = 0.7;

const HARD_ESCALATIONS: Partial<Record<Intent, { team: Team; reason: string }>> = {
  fraud_report: { team: "trust_safety", reason: "Fraud complaint — policy requires Trust & Safety review" },
  data_breach: { team: "trust_safety", reason: "Possible data breach / account compromise — urgent security review" },
  legal_request: { team: "legal", reason: "Legal request — must be handled by the Legal team" },
};

const TEAM_BY_INTENT: Partial<Record<Intent, Team>> = {
  payment_failure: "billing",
  refund_request: "billing",
  billing_question: "billing",
  subscription_issue: "engineering",
  plan_change: "billing",
  place_order: "billing",
  order_status: "logistics",
  wrong_item: "logistics",
  damaged_item: "logistics",
  login_issue: "trust_safety",
  password_reset: "trust_safety",
};

export interface EscalationDecision {
  decision: "auto_resolve" | "escalate";
  team: Team;
  reasons: string[];
  signals: Record<string, unknown>;
}

/**
 * Pre-check, run before the resolver. Short-circuits cases automation must not touch,
 * customers who demand a human, and angry repeat contacts.
 */
export function preEscalationCheck(intent: IntentAnalysis, ctx: CustomerContext, state: IssueState): EscalationDecision {
  const reasons: string[] = [];
  let team: Team = TEAM_BY_INTENT[intent.intent] ?? "general";
  const hard = HARD_ESCALATIONS[intent.intent];
  if (hard) {
    reasons.push(hard.reason);
    team = hard.team;
  }
  if (intent.wants_human) reasons.push("Customer explicitly requested a human agent");
  const repeatContact = ctx.highlights.openTickets > 0 || state.turns >= 5;
  if (intent.sentiment === "angry" && repeatContact) reasons.push("Angry customer on a repeat/long-running contact — escalate faster");
  const informational = ["greeting", "general_inquiry", "product_question", "feedback"].includes(intent.intent);
  if (!informational && intent.confidence < 0.5 && state.turns >= 3) reasons.push(`Intent still unclear after ${state.turns} turns (confidence ${Math.round(intent.confidence * 100)}%)`);

  return {
    decision: reasons.length ? "escalate" : "auto_resolve",
    team,
    reasons,
    signals: { intent: intent.intent, confidence: intent.confidence, sentiment: intent.sentiment, tier: ctx.customer.tier, openTickets: ctx.highlights.openTickets, turns: state.turns },
  };
}

/** Post-check, run after the resolver: combines its own request, its confidence, and the outcome. */
export function postEscalationCheck(
  intent: IntentAnalysis,
  resolver: { escalation: { reason: string; team: Team } | null; outcome: { status: string; confidence: number; summary?: string } | null },
): EscalationDecision {
  const reasons: string[] = [];
  let team: Team = TEAM_BY_INTENT[intent.intent] ?? "general";
  if (resolver.escalation) {
    reasons.push(resolver.escalation.reason || "Resolver requested a human specialist");
    team = resolver.escalation.team;
  }
  const outcome = resolver.outcome;
  if (outcome?.status === "needs_escalation" && !resolver.escalation) reasons.push(outcome.summary || "Resolver could not complete the workflow");
  if (outcome?.status === "resolved" && outcome.confidence < CONFIDENCE_THRESHOLD)
    reasons.push(`Resolution confidence ${Math.round(outcome.confidence * 100)}% is below the ${CONFIDENCE_THRESHOLD * 100}% threshold — needs human verification`);

  return {
    decision: reasons.length ? "escalate" : "auto_resolve",
    team,
    reasons: [...new Set(reasons)],
    signals: { outcome: outcome?.status ?? "none", confidence: outcome?.confidence ?? null, resolverRequested: Boolean(resolver.escalation) },
  };
}
