import type { CustomerContext } from "@/lib/agents/context";
import type { AgentRun, Conversation, Customer, Message, Ticket, TraceStep } from "@/lib/types";

export type ConversationSummary = Conversation & { last_message: string | null };

export interface CustomerDetail {
  context: CustomerContext;
  conversations: ConversationSummary[];
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  runs: AgentRun[];
  ticket: Ticket | null;
  csat: { rating: number; comment: string | null } | null;
  pending: { id: string; status: string }[];
}

export interface LiveRun {
  steps: TraceStep[];
  startedAt: number;
  llmCalls?: number;
  durationMs?: number;
  done: boolean;
}

export type { Customer };
