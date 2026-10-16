import type { FunctionDeclaration } from "@google/genai";
import { get, nowIso, run } from "@/lib/db";
import {
  createServiceRecord,
  getAccount,
  getCustomer,
  getOrder,
  getShipment,
  getSubscription,
  listOrders,
  listServiceRecords,
  listTransactions,
} from "@/lib/db/repo";
import { searchKb } from "@/lib/agents/knowledge";
import type { Intent, Order, Team, Transaction } from "@/lib/types";

export interface ToolContext {
  customerId: string;
  conversationId: string;
  intent: Intent | null;
  escalation: { reason: string; team: Team } | null;
  outcome: { status: "resolved" | "awaiting_customer" | "needs_escalation"; summary: string; confidence: number } | null;
}

export type ToolKind = "read" | "action" | "control";

interface Tool {
  kind: ToolKind;
  label: string;
  decl: FunctionDeclaration;
  run: (args: Record<string, unknown>, ctx: ToolContext) => unknown;
}

/** An action result always carries a customer-facing summary and optional reference id. */
export interface ActionResult {
  success: boolean;
  summary: string;
  ref?: string;
  [k: string]: unknown;
}

const AUTO_REFUND_LIMIT = 500;
/** Simulated backend fault: the entitlement service keeps failing for these accounts. */
const PERSISTENT_SYNC_FAILURES = new Set(["cus_john"]);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN);
const daysSince = (isoDate: string) => Math.floor((Date.now() - Date.parse(isoDate)) / 86_400_000);
const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + "•".repeat(Math.min(b.length, 6)) + c);

function ownedOrder(orderId: unknown, ctx: ToolContext): Order | { error: string } {
  const id = str(orderId);
  if (!id) return { error: "order_id is required" };
  const order = getOrder(id);
  if (!order || order.customer_id !== ctx.customerId) return { error: `Order ${id} was not found on this customer's account` };
  return order;
}

const existingRecord = (customerId: string, type: string, orderId: string) =>
  listServiceRecords(customerId).find((r) => r.type === type && r.order_id === orderId);

function capturedTxnForOrder(customerId: string, orderId: string): Transaction | undefined {
  return listTransactions(customerId, 50).find((t) => t.order_id === orderId && t.gateway_status === "captured" && t.status !== "refunded");
}

function refundTxn(ctx: ToolContext, t: Transaction, amount: number, reason: string): ActionResult {
  run("UPDATE transactions SET status = 'refunded', gateway_status = 'reversed' WHERE id = ?", t.id);
  const rec = createServiceRecord(
    {
      type: "refund",
      customer_id: ctx.customerId,
      order_id: t.order_id,
      conversation_id: ctx.conversationId,
      status: "processing",
      details: { transaction_id: t.id, amount, method: t.method, reason, eta: "5–7 business days" },
    },
    "RFD",
  );
  return {
    success: true,
    ref: rec.id,
    summary: `Refund ${rec.id} of $${amount.toFixed(2)} to ${t.method} (5–7 business days)`,
    amount,
    method: t.method,
    eta: "5–7 business days",
  };
}

const p = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const S = (description: string) => ({ type: "string", description });

export const TOOLS: Record<string, Tool> = {
  /* ---------------- investigation (Troubleshooting Agent) ---------------- */
  list_recent_orders: {
    kind: "read",
    label: "List recent orders",
    decl: { name: "list_recent_orders", description: "List the customer's 5 most recent orders with status and items.", parametersJsonSchema: p({}) },
    run: (_a, ctx) =>
      listOrders(ctx.customerId, 5).map((o) => ({ id: o.id, status: o.status, total: o.total, created_at: o.created_at, items: o.items.map((i) => i.name) })),
  },
  get_order: {
    kind: "read",
    label: "Look up order",
    decl: { name: "get_order", description: "Get full order details including items purchased and delivered.", parametersJsonSchema: p({ order_id: S("Order ID, e.g. ORD12345") }, ["order_id"]) },
    run: (a, ctx) => ownedOrder(a.order_id, ctx),
  },
  get_shipment: {
    kind: "read",
    label: "Verify shipment",
    decl: { name: "get_shipment", description: "Get carrier tracking status and events for an order.", parametersJsonSchema: p({ order_id: S("Order ID") }, ["order_id"]) },
    run: (a, ctx) => {
      const o = ownedOrder(a.order_id, ctx);
      if ("error" in o) return o;
      return getShipment(o.id) ?? { status: "not_shipped", message: "No shipment exists yet for this order." };
    },
  },
  compare_order_items: {
    kind: "read",
    label: "Compare purchased vs delivered",
    decl: { name: "compare_order_items", description: "Compare the items purchased with the items recorded as delivered (warehouse scan).", parametersJsonSchema: p({ order_id: S("Order ID") }, ["order_id"]) },
    run: (a, ctx) => {
      const o = ownedOrder(a.order_id, ctx);
      if ("error" in o) return o;
      if (!o.delivered_items) return { match: true, note: "Delivered items match the order (no discrepancy recorded)." };
      const ordered = o.items.map((i) => i.sku);
      const delivered = o.delivered_items.map((i) => i.sku);
      const missing = o.items.filter((i) => !delivered.includes(i.sku));
      const unexpected = o.delivered_items.filter((i) => !ordered.includes(i.sku));
      return {
        match: missing.length === 0 && unexpected.length === 0,
        ordered: o.items,
        delivered: o.delivered_items,
        missing,
        unexpected,
        finding: missing.length ? "Fulfilment error: delivered item does not match the order" : "Items match",
      };
    },
  },
  check_return_eligibility: {
    kind: "read",
    label: "Check return policy",
    decl: {
      name: "check_return_eligibility",
      description: "Check whether an order is eligible for return/replacement under the return policy.",
      parametersJsonSchema: p({ order_id: S("Order ID"), reason: { type: "string", enum: ["wrong_item", "damaged", "changed_mind", "other"] } }, ["order_id", "reason"]),
    },
    run: (a, ctx) => {
      const o = ownedOrder(a.order_id, ctx);
      if ("error" in o) return o;
      const reason = str(a.reason);
      if (existingRecord(ctx.customerId, "return", o.id)) return { eligible: false, reason: "A return request already exists for this order" };
      if (o.status !== "delivered") return { eligible: false, reason: `Order is ${o.status}; returns apply to delivered orders` };
      const tier = getCustomer(ctx.customerId)?.tier;
      const window = tier === "premium" ? 60 : 30;
      const age = o.delivered_at ? daysSince(o.delivered_at) : 0;
      if (reason === "wrong_item" || reason === "damaged")
        return { eligible: true, policy: "Fulfilment error — free advance replacement or full refund, prepaid label", days_since_delivery: age };
      return age <= window
        ? { eligible: true, policy: `Within ${window}-day return window`, days_left: window - age }
        : { eligible: false, reason: `Outside the ${window}-day return window (${age} days since delivery)` };
    },
  },
  get_transactions: {
    kind: "read",
    label: "Check transactions",
    decl: {
      name: "get_transactions",
      description: "Get the customer's recent payment transactions with gateway status, flagging anomalies (captured funds on failed payments, unfamiliar merchants).",
      parametersJsonSchema: p({ order_id: S("Optional order ID to filter by") }),
    },
    run: (a, ctx) => {
      const orderId = str(a.order_id);
      return listTransactions(ctx.customerId, 10)
        .filter((t) => !orderId || t.order_id?.toUpperCase() === orderId.toUpperCase())
        .map((t) => ({
          ...t,
          anomaly:
            t.status === "failed" && t.gateway_status === "captured"
              ? "captured_on_failed_payment — customer was debited but the order failed"
              : t.merchant !== "Nimbus Store"
                ? "external_merchant — charge not from Nimbus Store"
                : null,
        }));
    },
  },
  get_account_status: {
    kind: "read",
    label: "Check account & lock status",
    decl: { name: "get_account_status", description: "Get login account status, failed password attempts, lock status and lock reason.", parametersJsonSchema: p({}) },
    run: (_a, ctx) => {
      const acc = getAccount(ctx.customerId);
      if (!acc) return { error: "No account found" };
      const minutesLeft = acc.locked_until ? Math.max(0, Math.round((Date.parse(acc.locked_until) - Date.now()) / 60000)) : 0;
      return { ...acc, auto_unlock_in_minutes: acc.status === "locked" ? minutesLeft : null };
    },
  },
  get_subscription: {
    kind: "read",
    label: "Check subscription",
    decl: { name: "get_subscription", description: "Get subscription plan, status, entitlement sync status and the linked payment.", parametersJsonSchema: p({}) },
    run: (_a, ctx) => {
      const sub = getSubscription(ctx.customerId);
      if (!sub) return { error: "No subscription found" };
      const payment = sub.payment_txn_id ? get<Transaction>("SELECT * FROM transactions WHERE id = ?", sub.payment_txn_id) : null;
      return { ...sub, payment };
    },
  },
  search_knowledge_base: {
    kind: "read",
    label: "Search knowledge base",
    decl: { name: "search_knowledge_base", description: "Search FAQs, product docs, policies and troubleshooting guides.", parametersJsonSchema: p({ query: S("Search query") }, ["query"]) },
    run: (a, ctx) => searchKb(str(a.query), ctx.intent, 3),
  },

  /* ---------------- actions (Action Execution Agent) ---------------- */
  cancel_order: {
    kind: "action",
    label: "Cancel order",
    decl: { name: "cancel_order", description: "Cancel an order that is still processing. Automatically refunds the payment.", parametersJsonSchema: p({ order_id: S("Order ID") }, ["order_id"]) },
    run: (a, ctx): ActionResult | { error: string } => {
      const o = ownedOrder(a.order_id, ctx);
      if ("error" in o) return o;
      if (o.status !== "processing") return { error: `Order is ${o.status} and can no longer be cancelled. Offer a return instead.` };
      run("UPDATE orders SET status = 'cancelled' WHERE id = ?", o.id);
      const rec = createServiceRecord({ type: "cancellation", customer_id: ctx.customerId, order_id: o.id, conversation_id: ctx.conversationId, status: "completed", details: {} }, "CXL");
      const txn = capturedTxnForOrder(ctx.customerId, o.id);
      const refund = txn ? refundTxn(ctx, txn, txn.amount, "Order cancelled") : null;
      return {
        success: true,
        ref: rec.id,
        summary: `Order ${o.id} cancelled${refund ? ` · ${refund.summary}` : ""}`,
        refund,
      };
    },
  },
  create_return_request: {
    kind: "action",
    label: "Create return request",
    decl: {
      name: "create_return_request",
      description: "Create a return request (RMA) for a delivered order.",
      parametersJsonSchema: p({ order_id: S("Order ID"), reason: S("Reason for return") }, ["order_id", "reason"]),
    },
    run: (a, ctx): ActionResult | { error: string } => {
      const o = ownedOrder(a.order_id, ctx);
      if ("error" in o) return o;
      const existing = existingRecord(ctx.customerId, "return", o.id);
      if (existing) return { success: true, ref: existing.id, summary: `Return ${existing.id} already open for ${o.id}`, already_existed: true };
      const items = o.delivered_items ?? o.items;
      const rec = createServiceRecord(
        { type: "return", customer_id: ctx.customerId, order_id: o.id, conversation_id: ctx.conversationId, status: "awaiting_dropoff", details: { reason: str(a.reason), items } },
        "RET",
      );
      return { success: true, ref: rec.id, summary: `Return ${rec.id} created for ${o.id}`, return_window_days: 14, items };
    },
  },
  generate_return_label: {
    kind: "action",
    label: "Generate return label",
    decl: { name: "generate_return_label", description: "Generate a prepaid return shipping label for a return request.", parametersJsonSchema: p({ return_id: S("Return ID, e.g. RET-12345") }, ["return_id"]) },
    run: (a, ctx): ActionResult | { error: string } => {
      const rid = str(a.return_id);
      const ret = listServiceRecords(ctx.customerId).find((r) => r.id === rid && r.type === "return");
      if (!ret) return { error: `Return ${rid} not found` };
      const url = `https://labels.nimbus.example/${rid}.pdf`;
      run("UPDATE service_records SET details = ? WHERE id = ?", JSON.stringify({ ...ret.details, label_url: url }), rid);
      return { success: true, ref: rid, summary: `Prepaid UPS return label emailed for ${rid}`, label_url: url, carrier: "UPS", drop_off_by: new Date(Date.now() + 14 * 86_400_000).toDateString() };
    },
  },
  create_replacement_order: {
    kind: "action",
    label: "Create replacement order",
    decl: {
      name: "create_replacement_order",
      description: "Ship a free replacement of the originally ordered items (advance replacement, express shipping).",
      parametersJsonSchema: p({ order_id: S("Original order ID") }, ["order_id"]),
    },
    run: (a, ctx): ActionResult | { error: string } => {
      const o = ownedOrder(a.order_id, ctx);
      if ("error" in o) return o;
      const existing = existingRecord(ctx.customerId, "replacement", o.id);
      if (existing) return { success: true, ref: existing.id, summary: `Replacement ${existing.id} already created`, already_existed: true };
      const newOrderId = `ORD${Math.floor(20000 + Math.random() * 70000)}`;
      run(
        "INSERT INTO orders (id, customer_id, status, total, items, delivered_items, created_at, delivered_at) VALUES (?,?,?,?,?,?,?,?)",
        newOrderId, ctx.customerId, "processing", 0, JSON.stringify(o.items), null, nowIso(), null,
      );
      const eta = new Date(Date.now() + 2 * 86_400_000).toDateString();
      const rec = createServiceRecord(
        { type: "replacement", customer_id: ctx.customerId, order_id: o.id, conversation_id: ctx.conversationId, status: "shipping", details: { replacement_order_id: newOrderId, eta } },
        "RPL",
      );
      return { success: true, ref: rec.id, summary: `Replacement order ${newOrderId} ships express — arrives by ${eta}`, replacement_order_id: newOrderId, eta, items: o.items };
    },
  },
  initiate_refund: {
    kind: "action",
    label: "Initiate refund",
    decl: {
      name: "initiate_refund",
      description: `Refund a captured payment to the original method. Auto-approved up to $${AUTO_REFUND_LIMIT}; larger amounts return requires_approval.`,
      parametersJsonSchema: p(
        { order_id: S("Order ID (or use transaction_id)"), transaction_id: S("Transaction ID"), amount: { type: "number", description: "Amount to refund" }, reason: S("Reason") },
        ["amount", "reason"],
      ),
    },
    run: (a, ctx): ActionResult | { error: string; requires_approval?: boolean } => {
      const txnId = str(a.transaction_id);
      const orderId = str(a.order_id);
      const txns = listTransactions(ctx.customerId, 50);
      const t = txnId
        ? txns.find((x) => x.id.toUpperCase() === txnId.toUpperCase())
        : orderId
          ? capturedTxnForOrder(ctx.customerId, orderId.toUpperCase())
          : undefined;
      if (!t) return { error: "No matching captured transaction found for this customer" };
      if (t.status === "refunded") return { error: `Transaction ${t.id} has already been refunded` };
      if (t.gateway_status !== "captured") return { error: `Transaction ${t.id} is ${t.gateway_status}; nothing was captured, so no refund is needed (authorization holds release in 3–5 days)` };
      const amount = Number.isFinite(num(a.amount)) ? Math.min(num(a.amount), t.amount) : t.amount;
      if (amount > AUTO_REFUND_LIMIT)
        return { error: `Refund of $${amount.toFixed(2)} exceeds the $${AUTO_REFUND_LIMIT} auto-approval limit. Escalate to Billing for approval.`, requires_approval: true };
      return refundTxn(ctx, t, amount, str(a.reason));
    },
  },
  reset_password: {
    kind: "action",
    label: "Send password reset",
    decl: { name: "reset_password", description: "Send a password reset link to the customer's email on file.", parametersJsonSchema: p({}) },
    run: (_a, ctx): ActionResult => {
      const c = getCustomer(ctx.customerId)!;
      const rec = createServiceRecord({ type: "password_reset", customer_id: ctx.customerId, order_id: null, conversation_id: ctx.conversationId, status: "sent", details: { expires_in: "30 minutes" } }, "PWR");
      return { success: true, ref: rec.id, summary: `Password reset link sent to ${maskEmail(c.email)} (valid 30 min)`, sent_to: maskEmail(c.email) };
    },
  },
  unlock_account: {
    kind: "action",
    label: "Unlock account",
    decl: { name: "unlock_account", description: "Lift a temporary lock caused by too many failed login attempts. Refuses security locks.", parametersJsonSchema: p({}) },
    run: (_a, ctx): ActionResult | { error: string } => {
      const acc = getAccount(ctx.customerId);
      if (!acc) return { error: "No account found" };
      if (acc.status !== "locked") return { error: "Account is not locked" };
      if (acc.lock_reason !== "too_many_failed_attempts") return { error: "Security lock — must be reviewed by Trust & Safety. Escalate." };
      run("UPDATE accounts SET status = 'active', failed_login_attempts = 0, locked_until = NULL, lock_reason = NULL WHERE customer_id = ?", ctx.customerId);
      const rec = createServiceRecord({ type: "unlock", customer_id: ctx.customerId, order_id: null, conversation_id: ctx.conversationId, status: "completed", details: {} }, "UNL");
      return { success: true, ref: rec.id, summary: "Account unlocked and failed-attempt counter reset" };
    },
  },
  retry_subscription_sync: {
    kind: "action",
    label: "Retry subscription sync",
    decl: { name: "retry_subscription_sync", description: "Retry syncing a paid subscription with the entitlement service.", parametersJsonSchema: p({}) },
    run: (_a, ctx): ActionResult | { error: string } => {
      const sub = getSubscription(ctx.customerId);
      if (!sub) return { error: "No subscription found" };
      if (sub.sync_status === "ok" && sub.status === "active") return { success: true, summary: "Subscription already in sync and active" };
      if (PERSISTENT_SYNC_FAILURES.has(ctx.customerId)) {
        createServiceRecord({ type: "sync_retry", customer_id: ctx.customerId, order_id: null, conversation_id: ctx.conversationId, status: "failed", details: { error_code: "ENT-504" } }, "SYN");
        return {
          success: false,
          summary: "Sync retry failed — entitlement service error ENT-504",
          error_code: "ENT-504",
          logs: ["payment TXN verified: captured", "POST /entitlements/activate → 504 Gateway Timeout", "retry 2/2 → 504 Gateway Timeout"],
          next_step: "Requires Engineering review",
        };
      }
      run("UPDATE subscriptions SET sync_status = 'ok', status = 'active' WHERE customer_id = ?", ctx.customerId);
      const rec = createServiceRecord({ type: "sync_retry", customer_id: ctx.customerId, order_id: null, conversation_id: ctx.conversationId, status: "completed", details: {} }, "SYN");
      return { success: true, ref: rec.id, summary: `${sub.plan} plan activated after re-sync` };
    },
  },
  reactivate_subscription: {
    kind: "action",
    label: "Reactivate subscription",
    decl: { name: "reactivate_subscription", description: "Reactivate a cancelled or inactive subscription on the saved payment method.", parametersJsonSchema: p({}) },
    run: (_a, ctx): ActionResult | { error: string } => {
      const sub = getSubscription(ctx.customerId);
      if (!sub) return { error: "No subscription found" };
      if (sub.status === "active") return { error: "Subscription is already active" };
      if (sub.sync_status === "failed") return { error: "Subscription is paid but failed to sync — use retry_subscription_sync instead" };
      run("UPDATE subscriptions SET status = 'active' WHERE customer_id = ?", ctx.customerId);
      const rec = createServiceRecord({ type: "reactivation", customer_id: ctx.customerId, order_id: null, conversation_id: ctx.conversationId, status: "completed", details: { plan: sub.plan } }, "REA");
      return { success: true, ref: rec.id, summary: `${sub.plan} subscription reactivated` };
    },
  },
  upgrade_plan: {
    kind: "action",
    label: "Change plan",
    decl: {
      name: "upgrade_plan",
      description: "Change the customer's plan. Upgrades are prorated and immediate.",
      parametersJsonSchema: p({ plan: { type: "string", enum: ["free", "pro", "premium"] } }, ["plan"]),
    },
    run: (a, ctx): ActionResult | { error: string } => {
      const sub = getSubscription(ctx.customerId);
      const plan = str(a.plan);
      if (!sub) return { error: "No subscription found" };
      if (sub.plan === plan) return { error: `Customer is already on ${plan}` };
      const prices: Record<string, number> = { free: 0, pro: 49, premium: 99 };
      const prorated = Math.max(0, Math.round((prices[plan] - prices[sub.plan]) * 0.6 * 100) / 100);
      run("UPDATE subscriptions SET plan = ?, status = 'active' WHERE customer_id = ?", plan, ctx.customerId);
      if (plan === "premium") run("UPDATE customers SET tier = 'premium' WHERE id = ?", ctx.customerId);
      const rec = createServiceRecord({ type: "plan_change", customer_id: ctx.customerId, order_id: null, conversation_id: ctx.conversationId, status: "completed", details: { from: sub.plan, to: plan, prorated } }, "PLN");
      return { success: true, ref: rec.id, summary: `Plan changed ${sub.plan} → ${plan} (prorated charge $${prorated.toFixed(2)})`, prorated_charge: prorated };
    },
  },

  /* ---------------- control (feeds Escalation Agent / Memory) ---------------- */
  request_human_escalation: {
    kind: "control",
    label: "Request human escalation",
    decl: {
      name: "request_human_escalation",
      description: "Hand the case to a human specialist when policy requires it, an action needs approval, or you cannot resolve it.",
      parametersJsonSchema: p(
        { reason: S("Why a human is needed"), team: { type: "string", enum: ["billing", "engineering", "trust_safety", "legal", "logistics", "general"] } },
        ["reason", "team"],
      ),
    },
    run: (a, ctx) => {
      ctx.escalation = { reason: str(a.reason), team: (str(a.team) as Team) || "general" };
      return { accepted: true, note: "Escalation recorded. Tell the customer a specialist will follow up; a ticket will be created automatically." };
    },
  },
  report_outcome: {
    kind: "control",
    label: "Report outcome",
    decl: {
      name: "report_outcome",
      description: "Call exactly once, right before your final reply, to record the state of the issue.",
      parametersJsonSchema: p(
        {
          status: { type: "string", enum: ["resolved", "awaiting_customer", "needs_escalation"], description: "resolved = issue fully handled; awaiting_customer = you asked the customer something" },
          summary: S("One sentence on what was done / what is pending"),
          confidence: { type: "number", description: "0..1 confidence that the issue is correctly handled" },
        },
        ["status", "summary", "confidence"],
      ),
    },
    run: (a, ctx) => {
      const status = str(a.status) as NonNullable<ToolContext["outcome"]>["status"];
      const c = num(a.confidence);
      ctx.outcome = { status: status || "awaiting_customer", summary: str(a.summary), confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.7 };
      return { recorded: true };
    },
  },
};

export function toolDeclarations(names?: string[]): FunctionDeclaration[] {
  return (names ?? Object.keys(TOOLS)).map((n) => TOOLS[n].decl);
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext) {
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool ${name}` };
  return tool.run(args, ctx);
}

export const isActionResult = (v: unknown): v is ActionResult =>
  typeof v === "object" && v !== null && "success" in v && "summary" in v && (v as ActionResult).success === true;

