import { all, get } from "@/lib/db";
import { listTickets } from "@/lib/db/repo";
import { slaState } from "./sla";
import type { Intent } from "@/lib/types";

const DAY = 86_400_000;

const HYPOTHESES: Partial<Record<Intent, { title: string; hypothesis: string; team: string }>> = {
  payment_failure: { title: "Spike in payment failures", hypothesis: "Possible payment gateway outage or degraded checkout", team: "Payments / SRE" },
  login_issue: { title: "Spike in login problems", hypothesis: "Possible auth service incident or credential-stuffing attack", team: "Identity / Security" },
  subscription_issue: { title: "Spike in subscription activation failures", hypothesis: "Entitlement sync service may be degraded", team: "Engineering" },
  order_status: { title: "Spike in delivery enquiries", hypothesis: "Possible carrier delay in a region", team: "Logistics" },
  wrong_item: { title: "Spike in wrong-item deliveries", hypothesis: "Possible pick/pack error at a fulfilment centre", team: "Fulfilment" },
  damaged_item: { title: "Spike in damaged items", hypothesis: "Packaging or carrier handling problem", team: "Logistics" },
  fraud_report: { title: "Spike in fraud reports", hypothesis: "Possible account-takeover campaign", team: "Trust & Safety" },
};

export interface RootCauseAlert {
  intent: string;
  title: string;
  hypothesis: string;
  team: string;
  last24h: number;
  baselinePerDay: number;
  ratio: number;
  evidence: string[];
}

/** Root Cause Discovery: compares the last 24h of intent volume against the previous 13-day baseline. */
export function detectRootCauses(now = Date.now()): RootCauseAlert[] {
  const since = new Date(now - 14 * DAY).toISOString();
  const cutoff = now - DAY;
  const rows = all<{ intent: string; created_at: string }>("SELECT intent, created_at FROM conversations WHERE intent IS NOT NULL AND created_at >= ?", since);
  const recent = new Map<string, number>();
  const baseline = new Map<string, number>();
  for (const r of rows) {
    const map = Date.parse(r.created_at) >= cutoff ? recent : baseline;
    map.set(r.intent, (map.get(r.intent) ?? 0) + 1);
  }
  const alerts: RootCauseAlert[] = [];
  for (const [intent, count] of recent) {
    const perDay = (baseline.get(intent) ?? 0) / 13;
    const ratio = count / Math.max(perDay, 0.5);
    if (count >= 4 && ratio >= 3) {
      const h = HYPOTHESES[intent as Intent] ?? { title: `Spike in ${intent.replace(/_/g, " ")}`, hypothesis: "Unusual volume — investigate", team: "Operations" };
      const evidence = [`${count} conversations in the last 24h vs ${perDay.toFixed(1)}/day baseline (${ratio.toFixed(1)}×)`];
      if (intent === "payment_failure") {
        const failed = get<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE status = 'failed' AND created_at >= ?", new Date(cutoff).toISOString());
        const common = get<{ d: string; n: number }>(
          "SELECT description AS d, COUNT(*) AS n FROM transactions WHERE status = 'failed' AND created_at >= ? GROUP BY description ORDER BY n DESC LIMIT 1",
          new Date(cutoff).toISOString(),
        );
        if (failed?.n) evidence.push(`${failed.n} failed transactions in 24h — most common: "${common?.d}" (${common?.n}×)`);
      }
      alerts.push({ intent, ...h, last24h: count, baselinePerDay: Math.round(perDay * 10) / 10, ratio: Math.round(ratio * 10) / 10, evidence });
    }
  }
  return alerts.sort((a, b) => b.ratio - a.ratio);
}

export function getDashboardData(now = Date.now()) {
  const since = new Date(now - 14 * DAY).toISOString();
  const convs = all<{ status: string; intent: string | null; sentiment: string | null; created_at: string; resolved_at: string | null; resolution_type: string | null }>(
    "SELECT status, intent, sentiment, created_at, resolved_at, resolution_type FROM conversations WHERE created_at >= ?",
    since,
  );
  const escalatedIds = new Set(all<{ conversation_id: string }>("SELECT conversation_id FROM tickets WHERE conversation_id IS NOT NULL").map((r) => r.conversation_id));
  const convIds = all<{ id: string }>("SELECT id FROM conversations WHERE created_at >= ?", since).map((r) => r.id);
  const escalatedCount = convIds.filter((id) => escalatedIds.has(id)).length;

  const total = convs.length || 1;
  const resolved = convs.filter((c) => c.status === "resolved");
  const auto = resolved.filter((c) => c.resolution_type === "auto");
  const durations = resolved.filter((c) => c.resolved_at).map((c) => Date.parse(c.resolved_at!) - Date.parse(c.created_at));
  const avgResolutionMs = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;
  const autoDur = auto.filter((c) => c.resolved_at).map((c) => Date.parse(c.resolved_at!) - Date.parse(c.created_at));
  const avgAutoMs = autoDur.length ? autoDur.reduce((s, d) => s + d, 0) / autoDur.length : 0;

  const csat = get<{ avg: number | null; n: number; happy: number }>(
    "SELECT AVG(rating) AS avg, COUNT(*) AS n, SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS happy FROM csat WHERE created_at >= ?",
    since,
  )!;

  // daily series
  const days: { date: string; label: string; auto: number; human: number; escalatedOpen: number; total: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const start = new Date(now - d * DAY);
    start.setHours(0, 0, 0, 0);
    days.push({ date: start.toISOString().slice(0, 10), label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), auto: 0, human: 0, escalatedOpen: 0, total: 0 });
  }
  for (const c of convs) {
    const key = new Date(c.created_at);
    key.setHours(0, 0, 0, 0);
    const bucket = days.find((d) => d.date === key.toISOString().slice(0, 10));
    if (!bucket) continue;
    bucket.total++;
    if (c.resolution_type === "auto") bucket.auto++;
    else if (c.resolution_type === "human") bucket.human++;
    else bucket.escalatedOpen++;
  }

  const intentCounts = new Map<string, number>();
  const sentimentCounts = new Map<string, number>();
  for (const c of convs) {
    if (c.intent) intentCounts.set(c.intent, (intentCounts.get(c.intent) ?? 0) + 1);
    if (c.sentiment) sentimentCounts.set(c.sentiment, (sentimentCounts.get(c.sentiment) ?? 0) + 1);
  }

  const tickets = listTickets();
  const openTickets = tickets.filter((t) => ["open", "assigned", "pending_customer"].includes(t.status));
  const slaWatch = openTickets
    .map((t) => ({ ...t, sla: slaState(t, now) }))
    .filter((t) => t.sla === "at_risk" || t.sla === "breached" || (t.sla === "on_track" && Date.parse(t.sla_due_at) - now < 2 * 3_600_000))
    .sort((a, b) => Date.parse(a.sla_due_at) - Date.parse(b.sla_due_at))
    .slice(0, 6);

  const actions = get<{ n: number }>("SELECT COUNT(*) AS n FROM service_records WHERE created_at >= ?", since)!.n;

  return {
    kpis: {
      openTickets: openTickets.length,
      urgentOpen: openTickets.filter((t) => t.priority === "urgent").length,
      conversations: convs.length,
      resolutionRate: resolved.length / total,
      autoResolutionRate: auto.length / total,
      escalationRate: escalatedCount / total,
      avgResolutionMs,
      avgAutoMs,
      csatAvg: csat.avg ?? 0,
      csatCount: csat.n,
      csatHappy: csat.n ? csat.happy / csat.n : 0,
      aiActions: actions,
    },
    daily: days,
    intents: [...intentCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([intent, count]) => ({ intent, count })),
    sentiment: ["positive", "neutral", "negative", "angry"].map((s) => ({ sentiment: s, count: sentimentCounts.get(s) ?? 0 })),
    slaWatch,
    alerts: detectRootCauses(now),
    teams: Object.entries(
      openTickets.reduce<Record<string, number>>((acc, t) => ((acc[t.team] = (acc[t.team] ?? 0) + 1), acc), {}),
    ).map(([team, count]) => ({ team, count })),
  };
}

export type DashboardData = ReturnType<typeof getDashboardData>;
