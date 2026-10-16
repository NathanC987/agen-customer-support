import { all, get, json, newId, nowIso, run } from ".";
import type {
  Account,
  AgentRun,
  Conversation,
  Customer,
  IssueState,
  KbArticle,
  Message,
  MessageMeta,
  MessageRole,
  Order,
  ServiceRecord,
  Shipment,
  Subscription,
  Ticket,
  TicketEvent,
  TraceStep,
  Transaction,
} from "@/lib/types";

type Row = Record<string, unknown>;

export const emptyIssueState = (): IssueState => ({
  intent: null,
  category: null,
  entities: {},
  stepsCompleted: [],
  actionsTaken: [],
  openQuestions: [],
  lifecycle: "active",
  turns: 0,
});

/* ---------- mappers ---------- */

const toOrder = (r: Row): Order => ({
  ...(r as unknown as Order),
  items: json(r.items, []),
  delivered_items: json(r.delivered_items, null),
});

const toShipment = (r: Row): Shipment => ({ ...(r as unknown as Shipment), events: json(r.events, []) });

const toAccount = (r: Row): Account => ({ ...(r as unknown as Account), two_factor: Boolean(r.two_factor) });

const toKb = (r: Row): KbArticle => ({
  ...(r as unknown as KbArticle),
  tags: json(r.tags, []),
  intents: json(r.intents, []),
  workflow: json(r.workflow, null),
});

const toConversation = (r: Row): Conversation => ({
  ...(r as unknown as Conversation),
  issue_state: { ...emptyIssueState(), ...json<Partial<IssueState>>(r.issue_state, {}) },
});

const toMessage = (r: Row): Message => ({ ...(r as unknown as Message), meta: json<MessageMeta>(r.meta, {}) });

const toTicket = (r: Row): Ticket => ({
  ...(r as unknown as Ticket),
  investigation: json(r.investigation, []),
  actions_taken: json(r.actions_taken, []),
  escalation_reasons: json(r.escalation_reasons, []),
});

const toRun = (r: Row): AgentRun => ({ ...(r as unknown as AgentRun), steps: json<TraceStep[]>(r.steps, []) });

const toRecord = (r: Row): ServiceRecord => ({ ...(r as unknown as ServiceRecord), details: json(r.details, {}) });

/* ---------- customers & commerce ---------- */

export const listCustomers = () => all<Customer>("SELECT * FROM customers ORDER BY scenario IS NULL, name");
export const getCustomer = (id: string) => get<Customer>("SELECT * FROM customers WHERE id = ?", id);
export const getAccount = (customerId: string) => {
  const r = get<Row>("SELECT * FROM accounts WHERE customer_id = ?", customerId);
  return r ? toAccount(r) : undefined;
};
export const getSubscription = (customerId: string) =>
  get<Subscription>("SELECT * FROM subscriptions WHERE customer_id = ?", customerId);

export const listOrders = (customerId: string, limit = 10) =>
  all<Row>("SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?", customerId, limit).map(toOrder);
export const getOrder = (orderId: string) => {
  const r = get<Row>("SELECT * FROM orders WHERE upper(id) = upper(?)", orderId);
  return r ? toOrder(r) : undefined;
};
export const getShipment = (orderId: string) => {
  const r = get<Row>("SELECT * FROM shipments WHERE order_id = ?", orderId);
  return r ? toShipment(r) : undefined;
};
export const listTransactions = (customerId: string, limit = 10) =>
  all<Transaction>("SELECT * FROM transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?", customerId, limit);

export const listServiceRecords = (customerId: string) =>
  all<Row>("SELECT * FROM service_records WHERE customer_id = ? ORDER BY created_at DESC", customerId).map(toRecord);

export function createServiceRecord(
  rec: Omit<ServiceRecord, "id" | "created_at"> & { conversation_id?: string | null },
  prefix: string,
): ServiceRecord {
  const id = `${prefix}-${Math.floor(10000 + Math.random() * 89999)}`;
  const created_at = nowIso();
  run(
    "INSERT INTO service_records (id, type, customer_id, order_id, conversation_id, status, details, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id,
    rec.type,
    rec.customer_id,
    rec.order_id,
    rec.conversation_id ?? null,
    rec.status,
    JSON.stringify(rec.details),
    created_at,
  );
  return { ...rec, id, created_at };
}

/* ---------- knowledge base ---------- */

export const listKb = (includeDrafts = false) =>
  all<Row>(
    `SELECT * FROM kb_articles ${includeDrafts ? "" : "WHERE status = 'published'"} ORDER BY source DESC, type, title`,
  ).map(toKb);

export function insertKb(a: Omit<KbArticle, "created_at">) {
  run(
    "INSERT INTO kb_articles (id, title, type, tags, intents, content, workflow, source, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    a.id,
    a.title,
    a.type,
    JSON.stringify(a.tags),
    JSON.stringify(a.intents),
    a.content,
    a.workflow ? JSON.stringify(a.workflow) : null,
    a.source,
    a.status,
    nowIso(),
  );
}

export const publishKb = (id: string) => run("UPDATE kb_articles SET status = 'published' WHERE id = ?", id);

/* ---------- conversations ---------- */

export function createConversation(customerId: string, channel = "web"): Conversation {
  const id = newId("cv");
  const ts = nowIso();
  run(
    "INSERT INTO conversations (id, customer_id, channel, status, issue_state, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    id,
    customerId,
    channel,
    "active",
    JSON.stringify(emptyIssueState()),
    ts,
    ts,
  );
  return getConversation(id)!;
}

export const getConversation = (id: string) => {
  const r = get<Row>("SELECT * FROM conversations WHERE id = ?", id);
  return r ? toConversation(r) : undefined;
};

export const listConversations = (customerId: string) =>
  all<Row>(
    `SELECT c.*, (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role IN ('customer','assistant','agent') ORDER BY created_at DESC LIMIT 1) AS last_message
     FROM conversations c WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 30`,
    customerId,
  ).map((r) => ({ ...toConversation(r), last_message: (r.last_message as string | null) ?? null }));

export function updateConversation(id: string, patch: Partial<Omit<Conversation, "id">>) {
  const entries = Object.entries({ ...patch, updated_at: nowIso() }).filter(([, v]) => v !== undefined);
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([k, v]) => (k === "issue_state" ? JSON.stringify(v) : (v as string | number | null)));
  run(`UPDATE conversations SET ${sets} WHERE id = ?`, ...values, id);
}

export function addMessage(conversationId: string, role: MessageRole, content: string, meta: MessageMeta = {}): Message {
  const id = newId("msg");
  const created_at = nowIso();
  run(
    "INSERT INTO messages (id, conversation_id, role, content, meta, created_at) VALUES (?,?,?,?,?,?)",
    id,
    conversationId,
    role,
    content,
    JSON.stringify(meta),
    created_at,
  );
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", created_at, conversationId);
  return { id, conversation_id: conversationId, role, content, meta, created_at };
}

export const listMessages = (conversationId: string) =>
  all<Row>("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid", conversationId).map(toMessage);

export function saveRun(r: Omit<AgentRun, "id" | "created_at">): string {
  const id = newId("run");
  run(
    "INSERT INTO agent_runs (id, conversation_id, message_id, steps, llm_calls, duration_ms, created_at) VALUES (?,?,?,?,?,?,?)",
    id,
    r.conversation_id,
    r.message_id,
    JSON.stringify(r.steps),
    r.llm_calls,
    r.duration_ms,
    nowIso(),
  );
  return id;
}

export const listRuns = (conversationId: string) =>
  all<Row>("SELECT * FROM agent_runs WHERE conversation_id = ? ORDER BY created_at", conversationId).map(toRun);

/* ---------- tickets ---------- */

export const getTicket = (id: number) => {
  const r = get<Row>("SELECT * FROM tickets WHERE id = ?", id);
  return r ? toTicket(r) : undefined;
};

export const getTicketForConversation = (conversationId: string) => {
  const r = get<Row>("SELECT * FROM tickets WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", conversationId);
  return r ? toTicket(r) : undefined;
};

export const listTickets = () =>
  all<Row & { customer_name: string; customer_tier: string }>(
    `SELECT t.*, c.name AS customer_name, c.tier AS customer_tier
     FROM tickets t JOIN customers c ON c.id = t.customer_id ORDER BY t.created_at DESC`,
  ).map((r) => ({ ...toTicket(r), customer_name: r.customer_name, customer_tier: r.customer_tier }));

export const listCustomerTickets = (customerId: string) =>
  all<Row>("SELECT * FROM tickets WHERE customer_id = ? ORDER BY created_at DESC", customerId).map(toTicket);

export function insertTicket(t: Omit<Ticket, "id" | "created_at" | "updated_at" | "resolved_at" | "first_response_at">): Ticket {
  const ts = nowIso();
  const res = run(
    `INSERT INTO tickets (conversation_id, customer_id, title, issue, investigation, actions_taken, recommended_next, status,
      status_label, priority, category, intent, sentiment, team, assignee, escalation_reasons, sla_due_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    t.conversation_id,
    t.customer_id,
    t.title,
    t.issue,
    JSON.stringify(t.investigation),
    JSON.stringify(t.actions_taken),
    t.recommended_next,
    t.status,
    t.status_label,
    t.priority,
    t.category,
    t.intent,
    t.sentiment,
    t.team,
    t.assignee,
    JSON.stringify(t.escalation_reasons),
    t.sla_due_at,
    ts,
    ts,
  );
  return getTicket(Number(res.lastInsertRowid))!;
}

export function updateTicket(id: number, patch: Partial<Omit<Ticket, "id">>) {
  const jsonKeys = new Set(["investigation", "actions_taken", "escalation_reasons"]);
  const entries = Object.entries({ ...patch, updated_at: nowIso() }).filter(([, v]) => v !== undefined);
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([k, v]) => (jsonKeys.has(k) ? JSON.stringify(v) : (v as string | number | null)));
  run(`UPDATE tickets SET ${sets} WHERE id = ?`, ...values, id);
}

export function addTicketEvent(e: Omit<TicketEvent, "id" | "created_at">) {
  run(
    "INSERT INTO ticket_events (id, ticket_id, type, from_status, to_status, actor, note, created_at) VALUES (?,?,?,?,?,?,?,?)",
    newId("tev"),
    e.ticket_id,
    e.type,
    e.from_status,
    e.to_status,
    e.actor,
    e.note,
    nowIso(),
  );
}

export const listTicketEvents = (ticketId: number) =>
  all<TicketEvent>("SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at, rowid", ticketId);

/* ---------- csat ---------- */

export const getCsat = (conversationId: string) =>
  get<{ rating: number; comment: string | null; sentiment: string; resolution_quality: string }>(
    "SELECT * FROM csat WHERE conversation_id = ?",
    conversationId,
  );
