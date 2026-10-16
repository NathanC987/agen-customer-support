import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Bot, ChevronDown, CircleDot, Clock, Headset, MessageSquare, Sparkles, User } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { PersonAvatar, Pill, PriorityBadge, SentimentBadge, TicketStatusBadge, TierBadge } from "@/components/badges";
import { RichText } from "@/components/chat/rich-text";
import { TicketSummary } from "@/components/tickets/ticket-summary";
import { SlaIndicator } from "@/components/tickets/sla-indicator";
import { AssignSelect, LifecycleStepper, ReplyBox, StatusActions } from "@/components/tickets/ticket-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCustomerContext } from "@/lib/agents/context";
import { responseTargetMinutes } from "@/lib/agents/sla";
import { nextStatuses, teamAgents } from "@/lib/agents/tracking";
import { getTicket, listMessages, listTicketEvents } from "@/lib/db/repo";
import { HUMAN_AGENTS, TEAM_LABEL } from "@/lib/team";
import { humanize, timeAgo } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const ticket = getTicket(Number(id));
  if (!ticket) notFound();
  const ctx = getCustomerContext(ticket.customer_id);
  const events = listTicketEvents(ticket.id);
  const transcript = ticket.conversation_id ? listMessages(ticket.conversation_id) : [];
  const defaultAgent = ticket.assignee ?? HUMAN_AGENTS[ticket.team];

  return (
    <>
      <PageHeader title={`Ticket #${ticket.id}`} description={ticket.title}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/tickets">
            <ArrowLeft /> All tickets
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-4 p-4 md:p-6">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TicketStatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                  <SentimentBadge sentiment={ticket.sentiment} />
                  <Pill tone="brand">{ticket.status_label}</Pill>
                </div>
                <h2 className="text-lg font-semibold tracking-tight">{ticket.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {humanize(ticket.intent)} · {humanize(ticket.category)} · {TEAM_LABEL[ticket.team]} queue · opened {timeAgo(ticket.created_at)}
                </p>
              </div>
              <StatusActions ticketId={ticket.id} next={nextStatuses(ticket.status)} />
            </div>
            <LifecycleStepper status={ticket.status} />
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-primary" /> AI case summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TicketSummary ticket={ticket} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Headset className="size-4 text-chart-2" /> Reply to customer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReplyBox ticketId={ticket.id} defaultAgent={defaultAgent} disabled={!ticket.conversation_id} />
              </CardContent>
            </Card>

            {transcript.length > 0 && (
              <Card className="py-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-sm font-semibold">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    Full conversation transcript
                    <span className="text-xs font-normal text-muted-foreground">({transcript.length} messages — optional reading)</span>
                    <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 border-t px-4 py-4">
                    {transcript.map((m) => (
                      <div key={m.id} className="flex gap-2.5">
                        <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", m.role === "customer" ? "bg-muted" : m.role === "agent" ? "bg-chart-2/15 text-chart-2" : m.role === "system" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                          {m.role === "customer" ? <User className="size-3.5" /> : m.role === "agent" ? <Headset className="size-3.5" /> : m.role === "system" ? <CircleDot className="size-3.5" /> : <Bot className="size-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/80">{m.role === "customer" ? ctx.customer.name : m.role === "assistant" ? "Nova (AI)" : m.role === "agent" ? "Specialist" : "System"}</span> · {fmt(m.created_at)}
                          </p>
                          <RichText text={m.content} />
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ownership & SLA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Assignee</p>
                  <AssignSelect ticketId={ticket.id} assignee={ticket.assignee} agents={teamAgents} />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
                  <div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" /> First response target
                    </p>
                    <p className="text-sm font-medium">
                      {responseTargetMinutes(ctx.customer.tier, ticket.priority)} min · due {fmt(ticket.sla_due_at)}
                    </p>
                  </div>
                  <SlaIndicator ticket={ticket} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={ctx.customer.name} className="size-10" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-medium">{ctx.customer.name}</p>
                      <TierBadge tier={ctx.customer.tier} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{ctx.customer.email}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">Previous tickets</dt>
                  <dd className="text-right font-medium">{ctx.highlights.previousTickets}</dd>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="text-right font-medium">{ctx.highlights.plan}</dd>
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="text-right font-medium">{humanize(ctx.highlights.accountStatus)}</dd>
                  <dt className="text-muted-foreground">Last purchase</dt>
                  <dd className="text-right font-medium">{ctx.highlights.lastPurchase ? timeAgo(ctx.highlights.lastPurchase) : "—"}</dd>
                </dl>
                {ctx.orders.length > 0 && (
                  <ul className="divide-y rounded-lg border text-xs">
                    {ctx.orders.slice(0, 3).map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <span className="font-mono">{o.id}</span>
                        <span className="truncate text-muted-foreground">{humanize(o.status)}</span>
                        <span className="font-medium tabular-nums">${o.total.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-3 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-border">
                  {[...events].reverse().map((e) => (
                    <li key={e.id} className="relative pl-5">
                      <span className={cn("absolute top-1 left-0 size-[11px] rounded-full border-2 border-background", e.type === "sla" ? "bg-warning" : e.type === "reply" ? "bg-chart-2" : e.type === "created" ? "bg-primary" : "bg-muted-foreground/50")} />
                      <p className="text-xs">
                        <span className="font-medium">{e.actor}</span>{" "}
                        <span className="text-muted-foreground">
                          {e.type === "status" ? `moved ${humanize(e.from_status)} → ${humanize(e.to_status)}` : e.type === "reply" ? "replied" : e.type === "note" ? "added a note" : ""}
                        </span>
                      </p>
                      {e.note && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{e.note}</p>}
                      <p className="mt-0.5 text-[10px] text-muted-foreground/80">{fmt(e.created_at)}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TicketPage({ params }: PageProps<"/tickets/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <Skeleton className="h-40 rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-96 rounded-xl lg:col-span-2" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </div>
      }
    >
      <TicketDetail params={params} />
    </Suspense>
  );
}
