import { all, get, json, newId, nowIso, run, tx, uniqueId } from "@/lib/db";
import { createServiceRecord, getCustomer, getSubscription, listTransactions } from "@/lib/db/repo";

/* ======================= Inventory ======================= */

export interface Product {
  sku: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  description: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export const PLANS = {
  free: { price: 0, perks: "standard support, 30-day returns" },
  pro: { price: 49, perks: "faster support, member deals, 30-day returns" },
  premium: { price: 99, perks: "priority 15-minute support, free express shipping, 60-day returns, extended warranties" },
} as const;
export type PlanName = keyof typeof PLANS;

export const listProducts = (includeInactive = false) =>
  all<Product>(`SELECT * FROM products ${includeInactive ? "" : "WHERE active = 1"} ORDER BY category, name`);
export const getProduct = (sku: string) => get<Product>("SELECT * FROM products WHERE sku = ? COLLATE NOCASE", sku.trim());
export const productCategories = () => all<{ category: string; n: number }>("SELECT category, COUNT(*) AS n FROM products WHERE active = 1 GROUP BY category ORDER BY category");

/** SQL fallback for product search when the vector DB is unavailable. */
export function keywordProducts(query: string, limit = 8): Product[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return listProducts().slice(0, limit);
  const rows = listProducts();
  return rows
    .map((p) => ({ p, s: words.filter((w) => `${p.sku} ${p.name} ${p.category} ${p.description}`.toLowerCase().includes(w)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

/**
 * Atomic stock movement. Decrements only succeed when enough stock exists (no overselling,
 * even under concurrent orders) — the WHERE clause is the check.
 */
export function moveStock(sku: string, delta: number, reason: string, actor: string, ref: string | null = null) {
  return tx(() => {
    const res = run("UPDATE products SET stock = stock + ?, updated_at = ? WHERE sku = ? AND stock + ? >= 0", delta, nowIso(), sku, delta);
    if (res.changes !== 1) {
      const p = getProduct(sku);
      throw new Error(p ? `Only ${p.stock} × ${p.name} left in stock` : `Unknown product ${sku}`);
    }
    run("INSERT INTO inventory_events (id, sku, delta, reason, ref, actor, created_at) VALUES (?,?,?,?,?,?,?)", newId("inv"), sku, delta, reason, ref, actor, nowIso());
    return getProduct(sku)!;
  });
}

export function createProduct(p: { sku: string; name: string; price: number; category: string; stock: number; description: string }, actor: string) {
  return tx(() => {
    if (getProduct(p.sku)) throw new Error(`SKU ${p.sku} already exists`);
    const now = nowIso();
    run(
      "INSERT INTO products (sku, name, price, category, stock, description, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      p.sku, p.name, p.price, p.category, 0, p.description, 1, now, now,
    );
    if (p.stock > 0) moveStock(p.sku, p.stock, "initial stock", actor);
    return getProduct(p.sku)!;
  });
}

export const recentInventoryEvents = (limit = 12) =>
  all<{ id: string; sku: string; delta: number; reason: string; ref: string | null; actor: string; created_at: string; name: string | null }>(
    "SELECT e.*, p.name FROM inventory_events e LEFT JOIN products p ON p.sku = e.sku ORDER BY e.created_at DESC LIMIT ?",
    limit,
  );

/* ======================= Pending (confirm-before-spend) actions ======================= */

export interface OrderLine {
  sku: string;
  name: string;
  qty: number;
  price: number;
}

export type PendingPayload =
  | { kind: "place_order"; lines: OrderLine[]; total: number }
  | { kind: "change_plan"; from: string; to: PlanName; amount: number };

export interface PendingAction {
  id: string;
  customer_id: string;
  conversation_id: string;
  type: PendingPayload["kind"];
  payload: PendingPayload;
  amount: number;
  summary: string;
  status: "pending" | "processing" | "confirmed" | "cancelled" | "expired" | "superseded" | "failed";
  result: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
}

const PENDING_TTL_MS = 15 * 60_000;

const toPending = (r: Record<string, unknown>): PendingAction => ({
  ...(r as unknown as PendingAction),
  payload: json(r.payload, {} as PendingPayload),
  result: json(r.result, null),
});

export function getPending(id: string): PendingAction | undefined {
  const r = get<Record<string, unknown>>("SELECT * FROM pending_actions WHERE id = ?", id);
  return r ? toPending(r) : undefined;
}

export function openPendingFor(customerId: string): PendingAction[] {
  run("UPDATE pending_actions SET status = 'expired', resolved_at = ? WHERE status = 'pending' AND expires_at <= ?", nowIso(), nowIso());
  return all<Record<string, unknown>>("SELECT * FROM pending_actions WHERE customer_id = ? AND status = 'pending' ORDER BY created_at DESC", customerId).map(toPending);
}

/** Creates a quote that the customer must confirm. Any earlier open quote of the same kind is superseded. */
export function createPending(customerId: string, conversationId: string, payload: PendingPayload, summary: string): PendingAction {
  return tx(() => {
    run(
      "UPDATE pending_actions SET status = 'superseded', resolved_at = ? WHERE customer_id = ? AND type = ? AND status = 'pending'",
      nowIso(), customerId, payload.kind,
    );
    const id = uniqueId("PA-", "pending_actions");
    const amount = payload.kind === "place_order" ? payload.total : payload.amount;
    run(
      "INSERT INTO pending_actions (id, customer_id, conversation_id, type, payload, amount, summary, status, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      id, customerId, conversationId, payload.kind, JSON.stringify(payload), amount, summary, "pending", nowIso(), new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    );
    return getPending(id)!;
  });
}

export interface ExecResult {
  success: boolean;
  summary: string;
  ref?: string;
  [k: string]: unknown;
}

/**
 * Executes a confirmed action EXACTLY ONCE. The status compare-and-set (pending → processing) means a
 * double click, a retried request or a replayed "yes" can never run it twice.
 */
export function executePending(id: string, customerId: string, via: "button" | "chat"): ExecResult {
  const claimed = run(
    "UPDATE pending_actions SET status = 'processing' WHERE id = ? AND customer_id = ? AND status = 'pending' AND expires_at > ?",
    id, customerId, nowIso(),
  );
  if (claimed.changes !== 1) {
    const p = getPending(id);
    if (!p || p.customer_id !== customerId) return { success: false, summary: "That confirmation request was not found" };
    if (p.status === "confirmed") return { success: false, summary: `Already done — ${p.result?.summary ?? "this was confirmed earlier"}`, already_done: true };
    if (p.status === "pending") return { success: false, summary: "That quote has expired — ask me again for a fresh one" };
    return { success: false, summary: `That request is ${p.status} and can't be confirmed` };
  }
  const p = getPending(id)!;
  try {
    const result = tx(() => (p.payload.kind === "place_order" ? placeOrder(p, via) : changePlan(p)));
    run("UPDATE pending_actions SET status = 'confirmed', result = ?, resolved_at = ? WHERE id = ?", JSON.stringify(result), nowIso(), id);
    return result;
  } catch (e) {
    const summary = e instanceof Error ? e.message : String(e);
    run("UPDATE pending_actions SET status = 'failed', result = ?, resolved_at = ? WHERE id = ?", JSON.stringify({ summary }), nowIso(), id);
    return { success: false, summary };
  }
}

export function cancelPending(id: string, customerId: string): boolean {
  return run("UPDATE pending_actions SET status = 'cancelled', resolved_at = ? WHERE id = ? AND customer_id = ? AND status = 'pending'", nowIso(), id, customerId).changes === 1;
}

const savedMethod = (customerId: string) => listTransactions(customerId, 1)[0]?.method ?? "Visa •••• 4242";

function placeOrder(p: PendingAction, via: string): ExecResult {
  if (p.payload.kind !== "place_order") throw new Error("bad payload");
  const { lines } = p.payload;
  const orderId = uniqueId("ORD", "orders");
  // re-price from live data at confirmation time; refuse if the price moved since the quote
  let total = 0;
  for (const l of lines) {
    const prod = getProduct(l.sku);
    if (!prod || !prod.active) throw new Error(`${l.name} is no longer available`);
    if (prod.price !== l.price) throw new Error(`The price of ${prod.name} changed since the quote — please ask again`);
    moveStock(l.sku, -l.qty, "customer order", `customer:${p.customer_id}`, orderId); // throws (and rolls back) if stock ran out
    total += l.qty * l.price;
  }
  total = Math.round(total * 100) / 100;
  const premium = getCustomer(p.customer_id)?.tier === "premium";
  const now = nowIso();
  run(
    "INSERT INTO orders (id, customer_id, status, total, items, delivered_items, created_at, delivered_at) VALUES (?,?,?,?,?,?,?,?)",
    orderId, p.customer_id, "processing", total, JSON.stringify(lines), null, now, null,
  );
  const method = savedMethod(p.customer_id);
  const txnId = uniqueId("TXN-", "transactions");
  run(
    "INSERT INTO transactions (id, customer_id, order_id, amount, status, gateway_status, method, merchant, description, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    txnId, p.customer_id, orderId, total, "succeeded", "captured", method, "Nimbus Store", `Order ${orderId}`, now,
  );
  const eta = new Date(Date.now() + (premium ? 2 : 5) * 86_400_000).toDateString();
  createServiceRecord(
    { type: "order", customer_id: p.customer_id, order_id: orderId, conversation_id: p.conversation_id, status: "processing", details: { total, txn: txnId, eta, confirmed_via: via, pending_action: p.id } },
    "NEW",
  );
  return {
    success: true,
    ref: orderId,
    summary: `Order ${orderId} placed — $${total.toFixed(2)} charged to ${method}, ${premium ? "free express shipping, " : ""}arrives by ${eta}`,
    order_id: orderId,
    total,
    eta,
  };
}

function changePlan(p: PendingAction): ExecResult {
  if (p.payload.kind !== "change_plan") throw new Error("bad payload");
  const sub = getSubscription(p.customer_id);
  if (!sub) throw new Error("No subscription found");
  if (sub.plan !== p.payload.from) throw new Error(`Your plan changed since the quote (now ${sub.plan}) — please ask again`);
  const { to, amount } = p.payload;
  run("UPDATE subscriptions SET plan = ?, status = 'active', sync_status = 'ok' WHERE customer_id = ?", to, p.customer_id);
  run("UPDATE customers SET tier = ? WHERE id = ?", to === "premium" ? "premium" : "standard", p.customer_id);
  if (amount !== 0) {
    run(
      "INSERT INTO transactions (id, customer_id, order_id, amount, status, gateway_status, method, merchant, description, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      uniqueId("TXN-", "transactions"), p.customer_id, null, Math.abs(amount), amount > 0 ? "succeeded" : "refunded", amount > 0 ? "captured" : "reversed",
      savedMethod(p.customer_id), "Nimbus Store", `Nimbus ${to} plan — prorated ${amount > 0 ? "upgrade charge" : "downgrade credit"}`, nowIso(),
    );
  }
  const rec = createServiceRecord(
    { type: "plan_change", customer_id: p.customer_id, order_id: null, conversation_id: p.conversation_id, status: "completed", details: { from: sub.plan, to, prorated: amount, pending_action: p.id } },
    "PLN",
  );
  return {
    success: true,
    ref: rec.id,
    summary: `Plan changed ${sub.plan} → ${to} (${amount > 0 ? `prorated charge $${amount.toFixed(2)}` : amount < 0 ? `prorated credit $${Math.abs(amount).toFixed(2)}` : "no charge"})`,
  };
}

/** Quote for a plan change: ~60% of the year remains, so the difference is prorated at 60%. */
export function planQuote(from: string, to: PlanName) {
  const fromPrice = PLANS[from as PlanName]?.price ?? 0;
  return Math.round((PLANS[to].price - fromPrice) * 0.6 * 100) / 100;
}
