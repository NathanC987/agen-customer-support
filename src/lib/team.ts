import type { Team } from "@/lib/types";

/** On-call human specialists per escalation queue. */
export const HUMAN_AGENTS: Record<Team, string> = {
  billing: "Sarah Kim",
  engineering: "Diego Ruiz",
  trust_safety: "Amara Okafor",
  legal: "Priya Natarajan",
  logistics: "Tom Becker",
  general: "Lena Fischer",
};

export const TEAM_LABEL: Record<Team, string> = {
  billing: "Billing",
  engineering: "Engineering",
  trust_safety: "Trust & Safety",
  legal: "Legal",
  logistics: "Logistics",
  general: "General Support",
};
