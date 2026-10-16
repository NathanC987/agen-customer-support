import {
  getAccount,
  getCustomer,
  getSubscription,
  listCustomerTickets,
  listOrders,
  listServiceRecords,
  listTransactions,
} from "@/lib/db/repo";

/** Customer Context Agent: gathers everything needed for personalised support before answering. */
export function getCustomerContext(customerId: string) {
  const customer = getCustomer(customerId);
  if (!customer) throw new Error(`Unknown customer ${customerId}`);
  const orders = listOrders(customerId, 6);
  const tickets = listCustomerTickets(customerId);
  const transactions = listTransactions(customerId, 6);
  const account = getAccount(customerId) ?? null;
  const subscription = getSubscription(customerId) ?? null;
  const records = listServiceRecords(customerId).slice(0, 6);
  const lastOrder = orders[0];

  return {
    customer,
    account,
    subscription,
    orders,
    transactions,
    serviceRecords: records,
    tickets: tickets.slice(0, 5).map((t) => ({ id: t.id, title: t.title, status: t.status, created_at: t.created_at })),
    highlights: {
      tier: customer.tier,
      previousTickets: tickets.length,
      openTickets: tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length,
      lastPurchase: lastOrder?.created_at ?? null,
      accountStatus: account?.status ?? "unknown",
      plan: subscription ? `${subscription.plan} (${subscription.status})` : "none",
    },
  };
}

export type CustomerContext = ReturnType<typeof getCustomerContext>;

/** Compact projection for the LLM prompt — keeps token usage low on the free tier. */
export function contextForPrompt(ctx: CustomerContext) {
  return {
    name: ctx.customer.name,
    tier: ctx.customer.tier,
    customer_since: ctx.customer.created_at.slice(0, 10),
    account: ctx.account && { status: ctx.account.status, failed_login_attempts: ctx.account.failed_login_attempts, two_factor: ctx.account.two_factor },
    subscription: ctx.subscription && { plan: ctx.subscription.plan, status: ctx.subscription.status, sync_status: ctx.subscription.sync_status },
    recent_orders: ctx.orders.slice(0, 4).map((o) => ({ id: o.id, status: o.status, total: o.total, date: o.created_at.slice(0, 10), items: o.items.map((i) => i.name) })),
    previous_tickets: ctx.highlights.previousTickets,
    open_tickets: ctx.highlights.openTickets,
  };
}
