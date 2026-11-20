import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/auth/session";
import { AlarmClock, CheckCircle2, Flame, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/stat-card";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { Skeleton } from "@/components/ui/skeleton";
import { sweepSla, ticketStats } from "@/lib/agents/tracking";
import { listTickets } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Tickets" };

async function TicketsContent() {
  await connection();
  await requirePageUser("admin");
  sweepSla();
  const tickets = listTickets();
  const s = ticketStats(tickets);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active tickets" value={s.active} hint={`${s.unassigned} awaiting assignment`} icon={Inbox} />
        <StatCard label="Urgent" value={s.urgent} hint="Fraud, security & SLA risk" icon={Flame} tone="danger" />
        <StatCard label="SLA at risk" value={s.atRisk} hint="Auto-escalated to supervisor" icon={AlarmClock} tone="warning" />
        <StatCard label="Resolved (24h)" value={s.resolvedToday} hint="By human specialists" icon={CheckCircle2} tone="success" />
      </div>
      <TicketsTable tickets={tickets} />
    </>
  );
}

export default function TicketsPage() {
  return (
    <>
      <PageHeader title="Tickets" description="Escalated cases with full AI-generated context — no need to reread the conversation" />
      <div className="space-y-4 p-4 md:p-6">
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
              <Skeleton className="h-96 rounded-xl" />
            </div>
          }
        >
          <TicketsContent />
        </Suspense>
      </div>
    </>
  );
}
