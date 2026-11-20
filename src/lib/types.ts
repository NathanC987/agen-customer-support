export type Tier = "premium" | "standard";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Sentiment = "positive" | "neutral" | "negative" | "angry";
export type ConversationStatus = "active" | "awaiting_customer" | "resolved" | "escalated";
export type TicketStatus = "open" | "assigned" | "pending_customer" | "resolved" | "closed";
export type MessageRole = "customer" | "assistant" | "agent" | "system";
export type KbType = "faq" | "product_doc" | "policy" | "troubleshooting";
export type Team = "billing" | "engineering" | "trust_safety" | "legal" | "logistics" | "general";

export const INTENTS = [
  "wrong_item",
  "damaged_item",
  "order_status",
  "cancel_order",
  "return_request",
  "refund_request",
  "payment_failure",
  "billing_question",
  "login_issue",
  "password_reset",
  "subscription_issue",
  "plan_change",
  "fraud_report",
  "legal_request",
  "data_breach",
  "account_update",
  "place_order",
  "product_question",
  "human_request",
  "general_inquiry",
  "greeting",
  "feedback",
] as const;
export type Intent = (typeof INTENTS)[number];

export const CATEGORIES = [
  "orders",
  "shipping",
  "returns_refunds",
  "billing",
  "account_access",
  "subscription",
  "security",
  "legal",
  "product",
  "general",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  tier: Tier;
  location: string;
  created_at: string;
  scenario: string | null;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  customer_id: string;
  status: "processing" | "shipped" | "delivered" | "cancelled" | "returned" | "payment_failed";
  total: number;
  items: OrderItem[];
  delivered_items: OrderItem[] | null;
  created_at: string;
  delivered_at: string | null;
}

export interface Shipment {
  id: string;
  order_id: string;
  carrier: string;
  tracking_number: string;
  status: string;
  events: { at: string; status: string; location: string }[];
}

export interface Transaction {
  id: string;
  customer_id: string;
  order_id: string | null;
  amount: number;
  status: "succeeded" | "failed" | "pending" | "refunded";
  gateway_status: "captured" | "declined" | "authorized" | "reversed";
  method: string;
  merchant: string;
  description: string;
  created_at: string;
}

export interface Account {
  customer_id: string;
  status: "active" | "locked" | "suspended";
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  two_factor: boolean;
  lock_reason: string | null;
}

export interface Subscription {
  customer_id: string;
  plan: "free" | "pro" | "premium";
  status: "active" | "inactive" | "cancelled" | "past_due";
  sync_status: "ok" | "failed";
  renews_at: string | null;
  payment_txn_id: string | null;
}

export interface KbWorkflow {
  name: string;
  steps: string[];
  tools: string[];
  autoResolvable: boolean;
  reliability: number;
}

export interface KbArticle {
  id: string;
  title: string;
  type: KbType;
  tags: string[];
  intents: string[];
  content: string;
  workflow: KbWorkflow | null;
  source: "seed" | "auto";
  status: "published" | "draft";
  created_at: string;
}

export interface IssueState {
  intent: Intent | null;
  category: Category | null;
  entities: Record<string, string>;
  stepsCompleted: string[];
  actionsTaken: { action: string; ref?: string; summary: string }[];
  openQuestions: string[];
  lifecycle: ConversationStatus;
  turns: number;
}

export interface Conversation {
  id: string;
  customer_id: string;
  channel: string;
  status: ConversationStatus;
  intent: Intent | null;
  category: Category | null;
  priority: Priority | null;
  sentiment: Sentiment | null;
  confidence: number | null;
  summary: string | null;
  issue_state: IssueState;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_type: "auto" | "human" | null;
}

export interface MessageMeta {
  ticketId?: number;
  actions?: { action: string; ref?: string; summary: string }[];
  runId?: string;
  error?: boolean;
  kind?: "status_update" | "csat";
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  meta: MessageMeta;
}

export interface Ticket {
  id: number;
  conversation_id: string | null;
  customer_id: string;
  title: string;
  issue: string;
  investigation: string[];
  actions_taken: string[];
  recommended_next: string;
  status: TicketStatus;
  status_label: string;
  priority: Priority;
  category: string;
  intent: string;
  sentiment: Sentiment;
  team: Team;
  assignee: string | null;
  escalation_reasons: string[];
  sla_due_at: string;
  first_response_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TicketEvent {
  id: string;
  ticket_id: number;
  type: "created" | "status" | "assigned" | "reply" | "note" | "sla";
  from_status: string | null;
  to_status: string | null;
  actor: string;
  note: string | null;
  created_at: string;
}

export interface ServiceRecord {
  id: string;
  type: "return" | "refund" | "replacement" | "cancellation" | "password_reset" | "unlock" | "sync_retry" | "plan_change" | "reactivation" | "return_label" | "order";
  customer_id: string;
  order_id: string | null;
  status: string;
  details: Record<string, unknown>;
  created_at: string;
}

export type AgentName =
  | "orchestrator"
  | "memory"
  | "intent"
  | "context"
  | "knowledge"
  | "troubleshooting"
  | "action"
  | "escalation"
  | "ticket"
  | "tracking"
  | "sla"
  | "response";

export interface TraceStep {
  id: string;
  agent: AgentName;
  title: string;
  status: "running" | "done" | "skipped" | "error";
  summary?: string;
  data?: unknown;
  startedAt: number;
  durationMs?: number;
}

export interface AgentRun {
  id: string;
  conversation_id: string;
  message_id: string | null;
  steps: TraceStep[];
  llm_calls: number;
  duration_ms: number;
  created_at: string;
}
