import { AlertTriangle, CreditCard, Mail, MapPin, Package, ShieldCheck, ShieldAlert } from "lucide-react";
import { PersonAvatar, Pill, TierBadge } from "@/components/badges";
import { humanize, timeAgo } from "@/lib/ui-tokens";
import type { CustomerDetail } from "./types";
import type { IssueState } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={tone === "warn" ? "text-sm font-semibold text-warning" : "text-sm font-semibold"}>{value}</div>
    </div>
  );
}

export function CustomerPanel({ detail, issue }: { detail: CustomerDetail | null; issue: IssueState | null }) {
  if (!detail) return <div className="p-6 text-sm text-muted-foreground">Loading customer…</div>;
  const { customer, account, subscription, orders, transactions, highlights, serviceRecords } = detail.context;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <PersonAvatar name={customer.name} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{customer.name}</p>
            <TierBadge tier={customer.tier} />
          </div>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Mail className="size-3" /> {customer.email}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" /> {customer.location} · since {new Date(customer.created_at).getFullYear()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Previous tickets" value={highlights.previousTickets} />
        <Stat label="Last purchase" value={highlights.lastPurchase ? timeAgo(highlights.lastPurchase) : "—"} />
        <Stat label="Plan" value={subscription ? `${humanize(subscription.plan)} · ${subscription.status}` : "—"} tone={subscription?.status !== "active" ? "warn" : undefined} />
        <Stat
          label="Account"
          value={
            <span className="inline-flex items-center gap-1">
              {account?.status === "active" ? <ShieldCheck className="size-3.5 text-success" /> : <ShieldAlert className="size-3.5 text-warning" />}
              {humanize(account?.status)}
            </span>
          }
          tone={account?.status !== "active" ? "warn" : undefined}
        />
      </div>

      {issue && issue.intent && (
        <Section title="Issue memory">
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill tone="brand">{humanize(issue.intent)}</Pill>
              <Pill>{humanize(issue.lifecycle)}</Pill>
              <Pill>Turn {issue.turns}</Pill>
            </div>
            {Object.keys(issue.entities).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(issue.entities).map(([k, v]) => (
                  <span key={k} className="rounded-md bg-background px-1.5 py-0.5 font-mono text-[10.5px] ring-1 ring-border">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
            {issue.actionsTaken.length > 0 && (
              <ul className="space-y-1">
                {issue.actionsTaken.map((a, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-success" />
                    <span>{a.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}

      <Section title="Recent orders">
        <ul className="divide-y rounded-lg border">
          {orders.slice(0, 4).map((o) => (
            <li key={o.id} className="flex items-center gap-2.5 px-3 py-2">
              <Package className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{o.items.map((i) => i.name).join(", ")}</p>
                <p className="font-mono text-[10.5px] text-muted-foreground">
                  {o.id} · ${o.total.toFixed(2)} · {timeAgo(o.created_at)}
                </p>
              </div>
              <Pill tone={o.status === "payment_failed" ? "danger" : o.status === "delivered" ? "success" : o.status === "cancelled" ? "neutral" : "info"}>{humanize(o.status)}</Pill>
            </li>
          ))}
          {orders.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No orders</li>}
        </ul>
      </Section>

      <Section title="Recent transactions">
        <ul className="divide-y rounded-lg border">
          {transactions.slice(0, 4).map((t) => {
            const anomaly = (t.status === "failed" && t.gateway_status === "captured") || t.merchant !== "Nimbus Store";
            return (
              <li key={t.id} className="flex items-center gap-2.5 px-3 py-2">
                {anomaly ? <AlertTriangle className="size-4 shrink-0 text-warning" /> : <CreditCard className="size-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{t.description}</p>
                  <p className="font-mono text-[10.5px] text-muted-foreground">
                    {t.id} · {t.gateway_status}
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums">${t.amount.toFixed(2)}</span>
              </li>
            );
          })}
          {transactions.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No transactions</li>}
        </ul>
      </Section>

      {serviceRecords.length > 0 && (
        <Section title="Actions on file">
          <ul className="space-y-1.5">
            {serviceRecords.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[10.5px] text-muted-foreground">{r.id}</span>
                <span className="flex-1 truncate">{humanize(r.type)}</span>
                <Pill>{humanize(r.status)}</Pill>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
