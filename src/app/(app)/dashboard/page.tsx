import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Activity, AlertTriangle, ArrowUpRight, Bot, CheckCircle2, Inbox, Smile, Timer, TrendingUp, Zap } from "lucide-react";
import { IntentChart, VolumeChart } from "@/components/dashboard/charts";
import { PageHeader } from "@/components/shell/page-header";
import { PriorityBadge } from "@/components/badges";
import { StatCard } from "@/components/stat-card";
import { SlaIndicator } from "@/components/tickets/sla-indicator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardData } from "@/lib/agents/insights";
import { sweepSla } from "@/lib/agents/tracking";
import { TEAM_LABEL } from "@/lib/team";
import { SENTIMENT_EMOJI, formatDuration, humanize } from "@/lib/ui-tokens";
import type { Sentiment, Team } from "@/lib/types";

export const metadata: Metadata = { title: "Supervisor Dashboard" };

const pct = (n: number) => `${Math.round(n * 100)}%`;

const SENTIMENT_BAR: Record<Sentiment, string> = {
  positive: "bg-success",
  neutral: "bg-muted-foreground/40",
  negative: "bg-warning",
  angry: "bg-destructive",
};

async function DashboardContent() {
  await connection();
  sweepSla();
  const d = getDashboardData();
  const k = d.kpis;
  const sentimentTotal = d.sentiment.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <div className="space-y-4">
      {d.alerts.map((a) => (
        <div key={a.intent} className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4 sm:flex-row sm:items-start">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{a.title}</p>
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">{a.ratio}× baseline</span>
              <span className="text-xs text-muted-foreground">Root-cause detection</span>
            </div>
            <p className="mt-0.5 text-sm">
              <span className="font-medium">Likely cause:</span> {a.hypothesis}. <span className="text-muted-foreground">Suggested owner: {a.team}.</span>
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              {a.evidence.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Open tickets" value={k.openTickets} hint={`${k.urgentOpen} urgent`} icon={Inbox} />
        <StatCard label="Resolution rate" value={pct(k.resolutionRate)} hint={`${k.conversations} conversations · 14d`} icon={CheckCircle2} tone="success" />
        <StatCard label="AI auto-resolved" value={pct(k.autoResolutionRate)} hint="No human needed" icon={Bot} tone="brand" />
        <StatCard label="Avg resolution time" value={formatDuration(k.avgResolutionMs)} hint={`AI: ${formatDuration(k.avgAutoMs)}`} icon={Timer} tone="info" />
        <StatCard label="Escalation rate" value={pct(k.escalationRate)} hint="Sent to specialists" icon={TrendingUp} tone="warning" />
        <StatCard label="CSAT" value={`${k.csatAvg.toFixed(1)} / 5`} hint={`${pct(k.csatHappy)} satisfied · ${k.csatCount} ratings`} icon={Smile} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Conversations per day</CardTitle>
            <CardDescription>How each conversation ended — the indigo share needed no human</CardDescription>
          </CardHeader>
          <CardContent>
            <VolumeChart data={d.daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Customer sentiment</CardTitle>
            <CardDescription>Detected by the Intent Agent · last 14 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.sentiment.map((s) => (
              <div key={s.sentiment} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    <span aria-hidden className="mr-1.5">{SENTIMENT_EMOJI[s.sentiment as Sentiment]}</span>
                    {humanize(s.sentiment)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.count} · {pct(s.count / sentimentTotal)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${SENTIMENT_BAR[s.sentiment as Sentiment]}`} style={{ width: `${(s.count / sentimentTotal) * 100}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Zap className="size-3" /> AI actions executed
                </p>
                <p className="text-lg font-semibold tabular-nums">{k.aiActions}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Activity className="size-3" /> Conversations
                </p>
                <p className="text-lg font-semibold tabular-nums">{k.conversations}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top issues</CardTitle>
            <CardDescription>Intent volume · last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <IntentChart data={d.intents} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">SLA watchlist</CardTitle>
            <CardDescription>Tickets nearest their first-response deadline. At-risk tickets are auto-escalated to urgent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {d.slaWatch.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">All SLAs on track 🎉</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {d.slaWatch.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
                      <span className="font-mono text-xs text-muted-foreground">#{t.id}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.customer_name} · {TEAM_LABEL[t.team]} · {t.assignee ?? "Unassigned"}
                        </p>
                      </div>
                      <PriorityBadge priority={t.priority} className="hidden sm:inline-flex" />
                      <SlaIndicator ticket={t} />
                      <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {d.teams.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Open tickets by queue</p>
                <div className="flex flex-wrap gap-2">
                  {d.teams.map((t) => (
                    <span key={t.team} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs">
                      {TEAM_LABEL[t.team as Team]}
                      <span className="rounded bg-muted px-1.5 font-semibold tabular-nums">{t.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Supervisor Dashboard" description="Resolution quality, workload and emerging incidents across all channels" />
      <div className="p-4 md:p-6">
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
              <Skeleton className="h-80 rounded-xl" />
            </div>
          }
        >
          <DashboardContent />
        </Suspense>
      </div>
    </>
  );
}
