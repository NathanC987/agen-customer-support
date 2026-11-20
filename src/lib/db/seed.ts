import { db, newId, run, tx } from ".";
import { KB_SEED } from "./kb-seed";
import { emptyIssueState } from "./repo";
import { slaDueAt } from "@/lib/agents/sla";
import { HUMAN_AGENTS } from "@/lib/team";
import type { Category, Intent, Priority, Sentiment, Team, TicketStatus, Tier } from "@/lib/types";

/* deterministic PRNG so the demo data is stable between seeds */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + rand() * (b - a);

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
const ago = (ms: number) => iso(NOW - ms);


/* ------------------------------------------------------------------ */
/*  Demo customers — each maps to a scenario from the problem statement */
/* ------------------------------------------------------------------ */

function seedScenarioCustomers() {
  const customers: [string, string, string, string, Tier, string, string, number][] = [
    ["cus_john", "John Doe", "john.doe@example.com", "+1 415 555 0101", "premium", "San Francisco, US", "Premium subscription not activated", 900],
    ["cus_priya", "Priya Sharma", "priya.sharma@example.com", "+91 98200 55512", "standard", "Mumbai, IN", "Wrong item delivered", 400],
    ["cus_marcus", "Marcus Chen", "marcus.chen@example.com", "+1 206 555 0144", "premium", "Seattle, US", "Payment failed but money deducted", 700],
    ["cus_sofia", "Sofia Alvarez", "sofia.alvarez@example.com", "+34 612 555 019", "standard", "Madrid, ES", "Unable to log in", 250],
    ["cus_liam", "Liam O'Brien", "liam.obrien@example.com", "+353 87 555 0172", "standard", "Dublin, IE", "Unrecognized charges (fraud)", 180],
    ["cus_aisha", "Aisha Khan", "aisha.khan@example.com", "+44 7700 900123", "premium", "London, UK", "Cancel order & upgrade plan", 500],
    // Blank baseline customer: healthy account, free plan, no orders/transactions/tickets — for free-form demos
    ["cus_base", "Alex Morgan", "alex.morgan@example.com", "+1 555 0199", "standard", "Chicago, US", "General customer (no scenario)", 30],
  ];
  for (const [id, name, email, phone, tier, location, scenario, ageDays] of customers) {
    run(
      "INSERT INTO customers (id, name, email, phone, tier, location, scenario, created_at) VALUES (?,?,?,?,?,?,?,?)",
      id, name, email, phone, tier, location, scenario, ago(ageDays * DAY),
    );
  }

  const account = (id: string, status = "active", attempts = 0, lockedUntil: string | null = null, reason: string | null = null, twoFa = 0) =>
    run(
      "INSERT INTO accounts (customer_id, status, failed_login_attempts, locked_until, last_login_at, two_factor, lock_reason) VALUES (?,?,?,?,?,?,?)",
      id, status, attempts, lockedUntil, ago(between(1, 48) * HOUR), twoFa, reason,
    );
  account("cus_john", "active", 0, null, null, 1);
  account("cus_priya");
  account("cus_marcus", "active", 0, null, null, 1);
  account("cus_sofia", "locked", 5, iso(NOW + 25 * MIN), "too_many_failed_attempts");
  account("cus_liam");
  account("cus_aisha", "active", 0, null, null, 1);

  const sub = (id: string, plan: string, status: string, sync = "ok", txn: string | null = null) =>
    run(
      "INSERT INTO subscriptions (customer_id, plan, status, sync_status, renews_at, payment_txn_id) VALUES (?,?,?,?,?,?)",
      id, plan, status, sync, iso(NOW + between(30, 300) * DAY), txn,
    );
  sub("cus_john", "premium", "inactive", "failed", "TXN-88231");
  sub("cus_priya", "free", "active");
  sub("cus_marcus", "premium", "active");
  sub("cus_sofia", "pro", "active");
  sub("cus_liam", "free", "active");
  sub("cus_aisha", "pro", "active");
  // fixed values (no rand()) so adding this customer doesn't shift the seeded history
  run("INSERT INTO accounts (customer_id, status, failed_login_attempts, last_login_at, two_factor) VALUES (?,?,?,?,?)", "cus_base", "active", 0, ago(6 * HOUR), 0);
  run("INSERT INTO subscriptions (customer_id, plan, status, sync_status, renews_at) VALUES (?,?,?,?,?)", "cus_base", "free", "active", "ok", iso(NOW + 180 * DAY));

  const order = (
    id: string, customer: string, status: string, items: object[], deliveredItems: object[] | null, createdAgo: number, deliveredAgo: number | null,
  ) => {
    const total = (items as { price: number; qty: number }[]).reduce((s, i) => s + i.price * i.qty, 0);
    run(
      "INSERT INTO orders (id, customer_id, status, total, items, delivered_items, created_at, delivered_at) VALUES (?,?,?,?,?,?,?,?)",
      id, customer, status, Math.round(total * 100) / 100, JSON.stringify(items), deliveredItems ? JSON.stringify(deliveredItems) : null,
      ago(createdAgo), deliveredAgo === null ? null : ago(deliveredAgo),
    );
  };
  const shipment = (orderId: string, status: string, createdAgo: number, deliveredAgo: number | null) => {
    const events = [
      { at: ago(createdAgo - 4 * HOUR), status: "Label created", location: "Nimbus Fulfilment, Reno NV" },
      { at: ago(createdAgo - 20 * HOUR), status: "In transit", location: "Regional hub" },
    ];
    if (deliveredAgo !== null) events.push({ at: ago(deliveredAgo), status: "Delivered — left at front door", location: "Customer address" });
    run(
      "INSERT INTO shipments (id, order_id, carrier, tracking_number, status, events) VALUES (?,?,?,?,?,?)",
      newId("shp"), orderId, pick(["UPS", "FedEx", "DHL"]), `1Z${Math.floor(rand() * 1e10)}`, status, JSON.stringify(events),
    );
  };
  const txn = (id: string, customer: string, orderId: string | null, amount: number, status: string, gateway: string, desc: string, createdAgo: number, merchant = "Nimbus Store") =>
    run(
      "INSERT INTO transactions (id, customer_id, order_id, amount, status, gateway_status, method, merchant, description, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      id, customer, orderId, amount, status, gateway, pick(["Visa •••• 4242", "Mastercard •••• 5454", "Amex •••• 0005"]), merchant, desc, ago(createdAgo),
    );

  const HEADPHONES = { sku: "AS-WH-100-BLK", name: "AuraSound Wireless Headphones (Black)", qty: 1, price: 129 };
  const SPEAKER = { sku: "AS-SPK-MINI-BLU", name: "AuraSound Mini Bluetooth Speaker (Blue)", qty: 1, price: 49 };

  // John Doe — premium, 3 previous tickets, last purchase yesterday, premium payment OK but sync failed
  order("ORD12001", "cus_john", "processing", [{ sku: "NB-DESK-LAMP", name: "Nimbus Smart Desk Lamp", qty: 1, price: 59.99 }], null, 1 * DAY, null);
  order("ORD11820", "cus_john", "delivered", [HEADPHONES], [HEADPHONES], 40 * DAY, 36 * DAY);
  shipment("ORD11820", "delivered", 40 * DAY, 36 * DAY);
  txn("TXN-88231", "cus_john", null, 99, "succeeded", "captured", "Nimbus Premium — annual plan", 3 * HOUR);
  txn("TXN-87112", "cus_john", "ORD12001", 59.99, "succeeded", "captured", "Order ORD12001", 1 * DAY);

  // Priya — wrong item delivered on ORD12345
  order("ORD12345", "cus_priya", "delivered", [HEADPHONES], [SPEAKER], 5 * DAY, 2 * DAY);
  shipment("ORD12345", "delivered", 5 * DAY, 2 * DAY);
  order("ORD11977", "cus_priya", "delivered", [{ sku: "NB-MUG-SET", name: "Nimbus Ceramic Mug Set", qty: 2, price: 18 }], null, 30 * DAY, 26 * DAY);
  shipment("ORD11977", "delivered", 30 * DAY, 26 * DAY);
  txn("TXN-90011", "cus_priya", "ORD12345", 129, "succeeded", "captured", "Order ORD12345", 5 * DAY);

  // Marcus — checkout failed but gateway captured the money
  order("ORD12377", "cus_marcus", "payment_failed", [{ sku: "NB-CHAIR-ERGO", name: "Nimbus Ergo Office Chair", qty: 1, price: 249.99 }], null, 6 * HOUR, null);
  txn("TXN-90412", "cus_marcus", "ORD12377", 249.99, "failed", "captured", "Order ORD12377 — checkout error PF-502", 6 * HOUR);
  order("ORD12210", "cus_marcus", "delivered", [SPEAKER], [SPEAKER], 20 * DAY, 17 * DAY);
  shipment("ORD12210", "delivered", 20 * DAY, 17 * DAY);

  // Sofia — locked out
  order("ORD12150", "cus_sofia", "shipped", [{ sku: "NB-BACKPACK", name: "Nimbus Commuter Backpack", qty: 1, price: 79 }], null, 3 * DAY, null);
  shipment("ORD12150", "in_transit", 3 * DAY, null);

  // Liam — unrecognized charges
  txn("TXN-91877", "cus_liam", null, 812.4, "succeeded", "captured", "ELEC-STORE ONLINE purchase", 10 * HOUR, "ELEC-STORE ONLINE");
  txn("TXN-91878", "cus_liam", null, 455, "succeeded", "captured", "ELEC-STORE ONLINE purchase", 9 * HOUR, "ELEC-STORE ONLINE");
  order("ORD11502", "cus_liam", "delivered", [{ sku: "NB-CABLE-USBC", name: "USB-C Cable 2m", qty: 2, price: 12 }], null, 50 * DAY, 47 * DAY);

  // Aisha — order still processing (cancellable), Pro plan (upgradeable)
  order("ORD12410", "cus_aisha", "processing", [{ sku: "NB-KETTLE", name: "Nimbus Smart Kettle", qty: 1, price: 89 }], null, 2 * HOUR, null);
  txn("TXN-91990", "cus_aisha", "ORD12410", 89, "succeeded", "captured", "Order ORD12410", 2 * HOUR);
  order("ORD11999", "cus_aisha", "delivered", [HEADPHONES], [HEADPHONES], 15 * DAY, 12 * DAY);
  shipment("ORD11999", "delivered", 15 * DAY, 12 * DAY);
}

/* ------------------------------------------------------------------ */
/*  Background history for the supervisor dashboard                     */
/* ------------------------------------------------------------------ */

const FIRST = ["Emma", "Noah", "Olivia", "Ethan", "Ava", "Lucas", "Mia", "Mateo", "Zara", "Arjun", "Chloe", "Kenji", "Fatima", "Leo", "Nora", "Omar", "Hana", "Ivan", "Grace", "Ravi", "Isla", "Yusuf"];
const LAST = ["Johnson", "Martins", "Rossi", "Nguyen", "Patel", "Kowalski", "Tanaka", "Haddad", "Silva", "Novak", "Ibrahim", "Larsen"];

interface Template {
  intent: Intent;
  category: Category;
  weight: number;
  open: string[];
  close: string;
  escalateRate: number;
  team: Team;
  title: string;
}

const TEMPLATES: Template[] = [
  { intent: "order_status", category: "shipping", weight: 18, open: ["Where is my order?", "My package hasn't arrived yet, can you check?"], close: "Your order is out for delivery and should arrive today.", escalateRate: 0.08, team: "logistics", title: "Shipment stalled in transit" },
  { intent: "refund_request", category: "returns_refunds", weight: 12, open: ["I'd like a refund for my order", "Can I get my money back? The product isn't what I expected."], close: "I've started your return and the refund will reach you in 5–7 business days.", escalateRate: 0.2, team: "billing", title: "Refund above auto-approval limit" },
  { intent: "wrong_item", category: "returns_refunds", weight: 7, open: ["I received the wrong item", "This isn't what I ordered"], close: "A replacement is on its way and I've emailed you a prepaid return label.", escalateRate: 0.05, team: "logistics", title: "Repeated wrong-item fulfilment" },
  { intent: "login_issue", category: "account_access", weight: 10, open: ["I can't log in to my account", "It says my account is locked"], close: "Your account is unlocked and a password reset link is in your inbox.", escalateRate: 0.1, team: "trust_safety", title: "Suspicious-activity lock review" },
  { intent: "payment_failure", category: "billing", weight: 6, open: ["My payment failed but I was charged", "Card was charged twice?"], close: "I've refunded the captured amount — expect it in 5–7 business days.", escalateRate: 0.3, team: "billing", title: "Captured payment on failed checkout" },
  { intent: "cancel_order", category: "orders", weight: 8, open: ["Please cancel my order", "I want to cancel what I just bought"], close: "Your order has been cancelled and refunded automatically.", escalateRate: 0.04, team: "general", title: "Cancellation after dispatch" },
  { intent: "subscription_issue", category: "subscription", weight: 6, open: ["My premium features aren't showing", "I paid for Pro but it's not active"], close: "I re-synced your subscription — your plan is now active.", escalateRate: 0.35, team: "engineering", title: "Subscription entitlement sync failure" },
  { intent: "plan_change", category: "subscription", weight: 5, open: ["How do I upgrade to Premium?", "I want to reactivate my plan"], close: "You're now on Premium — enjoy priority support!", escalateRate: 0.02, team: "billing", title: "Plan change billing mismatch" },
  { intent: "product_question", category: "product", weight: 8, open: ["How do I pair my headphones?", "What's the battery life on the speaker?"], close: "Hold the power button for 5 seconds until the LED flashes blue to pair.", escalateRate: 0.03, team: "general", title: "Product defect report" },
  { intent: "fraud_report", category: "security", weight: 2, open: ["There are charges on my card I don't recognize", "I think someone used my account"], close: "Our Trust & Safety team has secured your account and is investigating.", escalateRate: 1, team: "trust_safety", title: "Unrecognized charges reported" },
  { intent: "damaged_item", category: "returns_refunds", weight: 4, open: ["My item arrived broken", "The box was crushed and the product is damaged"], close: "A free replacement is on the way — no need to return the damaged item.", escalateRate: 0.1, team: "logistics", title: "Damaged in transit — carrier claim" },
  { intent: "legal_request", category: "legal", weight: 1, open: ["I want all my data deleted under GDPR", "My lawyer will contact you"], close: "Your request has been passed to our Legal team.", escalateRate: 1, team: "legal", title: "GDPR erasure request" },
];

const totalWeight = TEMPLATES.reduce((s, t) => s + t.weight, 0);
function pickTemplate(): Template {
  let r = rand() * totalWeight;
  for (const t of TEMPLATES) if ((r -= t.weight) <= 0) return t;
  return TEMPLATES[0];
}

const PRIORITY_BY_INTENT: Partial<Record<Intent, Priority>> = {
  fraud_report: "urgent",
  legal_request: "high",
  payment_failure: "high",
  subscription_issue: "high",
  login_issue: "medium",
};

function seedHistory() {
  // background customers
  const bg: { id: string; tier: Tier }[] = [];
  for (let i = 0; i < 26; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const id = `cus_bg${i}`;
    const tier: Tier = rand() < 0.3 ? "premium" : "standard";
    run(
      "INSERT INTO customers (id, name, email, phone, tier, location, scenario, created_at) VALUES (?,?,?,?,?,?,?,?)",
      id, name, `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, "+1 555 0100", tier, pick(["Austin, US", "Toronto, CA", "Berlin, DE", "Sydney, AU", "Pune, IN"]), null, ago(between(60, 900) * DAY),
    );
    run("INSERT INTO accounts (customer_id, status, failed_login_attempts, two_factor) VALUES (?,?,?,?)", id, "active", 0, rand() < 0.5 ? 1 : 0);
    run("INSERT INTO subscriptions (customer_id, plan, status, sync_status) VALUES (?,?,?,?)", id, tier === "premium" ? "premium" : pick(["free", "pro"]), "active", "ok");
    bg.push({ id, tier });
  }

  const insertConversation = (opts: {
    tpl: Template;
    customer: { id: string; tier: Tier };
    createdMs: number;
    forceEscalate?: boolean;
    sentiment?: Sentiment;
  }) => {
    const { tpl, customer, createdMs } = opts;
    const escalated = opts.forceEscalate ?? rand() < tpl.escalateRate;
    const sentiment: Sentiment = opts.sentiment ?? (escalated ? pick(["negative", "angry", "negative"] as const) : pick(["neutral", "neutral", "negative", "positive"] as const));
    const basePriority = PRIORITY_BY_INTENT[tpl.intent] ?? pick(["low", "medium", "medium"] as const);
    const priority: Priority = customer.tier === "premium" && basePriority === "medium" ? "high" : basePriority;
    const id = newId("cv");
    const age = NOW - createdMs;
    // escalated tickets created recently are still in progress
    let ticketStatus: TicketStatus = "closed";
    if (escalated) {
      if (age < 2 * HOUR) ticketStatus = rand() < 0.6 ? "open" : "assigned";
      else if (age < 1 * DAY) ticketStatus = pick(["assigned", "pending_customer", "resolved"] as const);
      else if (age < 3 * DAY) ticketStatus = pick(["resolved", "closed", "pending_customer"] as const);
    }
    const resolvedByHuman = escalated && (ticketStatus === "resolved" || ticketStatus === "closed");
    const autoResolved = !escalated && age > 20 * MIN;
    const resolvedAt = autoResolved
      ? createdMs + between(2, 9) * MIN
      : resolvedByHuman
        ? createdMs + between(1.5, 26) * HOUR
        : null;
    const status = autoResolved || resolvedByHuman ? "resolved" : escalated ? "escalated" : "awaiting_customer";
    const state = { ...emptyIssueState(), intent: tpl.intent, category: tpl.category, lifecycle: status, turns: 2 };
    run(
      `INSERT INTO conversations (id, customer_id, channel, status, intent, category, priority, sentiment, confidence, summary, issue_state, created_at, updated_at, resolved_at, resolution_type)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, customer.id, pick(["web", "web", "web", "email", "mobile"]), status, tpl.intent, tpl.category, priority, sentiment,
      Math.round(between(escalated ? 0.45 : 0.75, escalated ? 0.85 : 0.98) * 100) / 100,
      tpl.open[0], JSON.stringify(state), iso(createdMs), iso(resolvedAt ?? createdMs + 3 * MIN),
      resolvedAt ? iso(resolvedAt) : null, autoResolved ? "auto" : resolvedByHuman ? "human" : null,
    );
    const msg = (role: string, content: string, at: number) =>
      run("INSERT INTO messages (id, conversation_id, role, content, meta, created_at) VALUES (?,?,?,?,?,?)", newId("msg"), id, role, content, "{}", iso(at));
    msg("customer", pick(tpl.open), createdMs);
    msg("assistant", escalated ? "I'm sorry about this — I've escalated it to a specialist with the full context so you won't need to repeat yourself." : tpl.close, createdMs + 40_000);

    if (escalated) {
      const team = tpl.team;
      const assignee = ticketStatus === "open" ? null : HUMAN_AGENTS[team];
      const res = run(
        `INSERT INTO tickets (conversation_id, customer_id, title, issue, investigation, actions_taken, recommended_next, status, status_label, priority, category, intent, sentiment, team, assignee, escalation_reasons, sla_due_at, first_response_at, created_at, updated_at, resolved_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, customer.id, tpl.title, tpl.open[0],
        JSON.stringify(["Customer context and order history reviewed", "Relevant workflow executed up to escalation point"]),
        JSON.stringify(["Collected order and account details", "Escalated with full context"]),
        "Review investigation notes and contact the customer.",
        ticketStatus, ticketStatus === "open" ? "Awaiting assignment" : "In progress", priority, tpl.category, tpl.intent, sentiment, team, assignee,
        JSON.stringify([tpl.escalateRate === 1 ? "Policy requires human handling" : "Resolution confidence below 70%"]),
        slaDueAt(createdMs + MIN, customer.tier, priority),
        assignee ? iso(createdMs + between(4, 50) * MIN) : null,
        iso(createdMs + MIN), iso(resolvedAt ?? createdMs + 30 * MIN), resolvedAt ? iso(resolvedAt) : null,
      );
      const ticketId = Number(res.lastInsertRowid);
      run("INSERT INTO ticket_events (id, ticket_id, type, actor, note, created_at) VALUES (?,?,?,?,?,?)", newId("tev"), ticketId, "created", "AI Ticket Agent", "Ticket generated from conversation", iso(createdMs + MIN));
      if (assignee)
        run("INSERT INTO ticket_events (id, ticket_id, type, from_status, to_status, actor, note, created_at) VALUES (?,?,?,?,?,?,?,?)", newId("tev"), ticketId, "assigned", "open", "assigned", "Routing", `Assigned to ${assignee}`, iso(createdMs + 5 * MIN));
    }

    if (resolvedAt && rand() < 0.62) {
      const rating = autoResolved ? pick([5, 5, 5, 4, 4, 4, 3, 5, 2]) : pick([5, 4, 4, 3, 3, 2, 5, 1]);
      run(
        "INSERT INTO csat (id, conversation_id, customer_id, rating, comment, sentiment, resolution_quality, created_at) VALUES (?,?,?,?,?,?,?,?)",
        newId("csat"), id, customer.id, rating, null, rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative",
        rating >= 4 ? "resolved" : rating === 3 ? "partially_resolved" : "unresolved", iso(resolvedAt + 2 * MIN),
      );
    }
  };

  // 14 days of steady traffic
  for (let d = 14; d >= 1; d--) {
    const count = Math.round(between(6, 11));
    for (let i = 0; i < count; i++) {
      insertConversation({ tpl: pickTemplate(), customer: pick(bg), createdMs: NOW - d * DAY - between(HOUR, DAY - HOUR) });
    }
  }
  // the last 24h: normal traffic + a payment-failure spike (root-cause demo)
  const calmIntents = new Set<Intent>(["order_status", "product_question", "cancel_order", "refund_request", "plan_change"]);
  const calm = TEMPLATES.filter((t) => calmIntents.has(t.intent));
  for (let i = 0; i < 6; i++) insertConversation({ tpl: pick(calm), customer: pick(bg), createdMs: NOW - between(30 * MIN, 22 * HOUR) });
  const paymentTpl = TEMPLATES.find((t) => t.intent === "payment_failure")!;
  for (let i = 0; i < 9; i++) {
    const createdMs = NOW - between(25 * MIN, 5 * HOUR);
    const customer = pick(bg);
    insertConversation({ tpl: paymentTpl, customer, createdMs, forceEscalate: i < 4, sentiment: pick(["negative", "angry"] as const) });
    run(
      "INSERT INTO transactions (id, customer_id, order_id, amount, status, gateway_status, method, merchant, description, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      `TXN-${93000 + i}`, customer.id, null, Math.round(between(20, 300) * 100) / 100, "failed", pick(["captured", "declined"]), "Visa •••• 1881", "Nimbus Store",
      "Checkout error PF-502 (PayFlow gateway timeout)", iso(createdMs - 2 * MIN),
    );
  }

  // John Doe's three previous tickets
  const johnTickets: [string, string, number][] = [
    ["Late delivery on ORD11820", "order_status", 34],
    ["Promo code not applied at checkout", "billing_question", 70],
    ["App crash when opening order history", "product_question", 120],
  ];
  for (const [title, intent, days] of johnTickets) {
    run(
      `INSERT INTO tickets (conversation_id, customer_id, title, issue, investigation, actions_taken, recommended_next, status, status_label, priority, category, intent, sentiment, team, assignee, escalation_reasons, sla_due_at, first_response_at, created_at, updated_at, resolved_at)
       VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      "cus_john", title, title, "[]", "[]", "—", "closed", "Closed", "medium", "general", intent, "neutral", "general", HUMAN_AGENTS.general, "[]",
      ago(days * DAY - 15 * MIN), ago(days * DAY - 9 * MIN), ago(days * DAY), ago(days * DAY - 5 * HOUR), ago(days * DAY - 5 * HOUR),
    );
  }
}

function seedKb() {
  for (const a of KB_SEED) {
    run(
      "INSERT INTO kb_articles (id, title, type, tags, intents, content, workflow, source, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      a.id, a.title, a.type, JSON.stringify(a.tags), JSON.stringify(a.intents), a.content, a.workflow ? JSON.stringify(a.workflow) : null, "seed", "published", ago(60 * DAY),
    );
  }
}

export function seed() {
  const d = db();
  const tables = ["csat", "ticket_events", "tickets", "agent_runs", "messages", "conversations", "service_records", "kb_articles", "subscriptions", "transactions", "shipments", "orders", "accounts", "customers"];
  tx(() => {
    for (const t of tables) d.exec(`DELETE FROM ${t}`);
    d.exec("DELETE FROM sqlite_sequence WHERE name = 'tickets'");
    d.exec("INSERT INTO sqlite_sequence (name, seq) VALUES ('tickets', 1000)");
    seedScenarioCustomers();
    seedKb();
    seedHistory();
  });
}
