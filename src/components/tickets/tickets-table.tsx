"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Search } from "lucide-react";
import { PersonAvatar, PriorityBadge, TicketStatusBadge, TierBadge } from "@/components/badges";
import { SlaIndicator } from "./sla-indicator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TICKET_STATUS, humanize, timeAgo } from "@/lib/ui-tokens";
import { TEAM_LABEL } from "@/lib/team";
import type { Ticket, TicketStatus } from "@/lib/types";

export type TicketRow = Ticket & { customer_name: string; customer_tier: string };

const FILTERS: { value: "active" | "all" | TicketStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "pending_customer", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];
const ACTIVE: TicketStatus[] = ["open", "assigned", "pending_customer"];
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TicketsTable({ tickets }: { tickets: TicketRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("active");
  const [priority, setPriority] = useState("all");
  const [team, setTeam] = useState("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tickets.length, active: 0 };
    for (const t of tickets) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      if (ACTIVE.includes(t.status)) c.active++;
    }
    return c;
  }, [tickets]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return tickets
      .filter((t) => (filter === "all" ? true : filter === "active" ? ACTIVE.includes(t.status) : t.status === filter))
      .filter((t) => priority === "all" || t.priority === priority)
      .filter((t) => team === "all" || t.team === team)
      .filter((t) => !query || `${t.id} ${t.title} ${t.customer_name} ${t.intent}`.toLowerCase().includes(query))
      .sort((a, b) =>
        filter === "active" || ACTIVE.includes(filter as TicketStatus)
          ? PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || Date.parse(a.sla_due_at) - Date.parse(b.sla_due_at)
          : Date.parse(b.created_at) - Date.parse(a.created_at),
      );
  }, [tickets, filter, priority, team, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                filter === f.value && "bg-background text-foreground shadow-sm",
              )}
            >
              {f.label}
              <span className="rounded-full bg-foreground/8 px-1.5 text-[10px] tabular-nums">{counts[f.value] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-2 lg:justify-end">
          <div className="relative flex-1 lg:max-w-64">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets…" className="pl-8" />
          </div>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {["urgent", "high", "medium", "low"].map((p) => (
                <SelectItem key={p} value={p}>
                  {humanize(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="hidden w-40 sm:flex">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {Object.entries(TEAM_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[38%]">Ticket</TableHead>
              <TableHead className="hidden md:table-cell">Customer</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Team</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} onClick={() => router.push(`/tickets/${t.id}`)} className="cursor-pointer">
                <TableCell className="max-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{t.id}</span>
                    <span className="truncate font-medium">{t.title}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {humanize(t.intent)} · {t.status_label}
                  </p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <PersonAvatar name={t.customer_name} className="size-6 text-[9px]" />
                    <span className="truncate text-sm">{t.customer_name}</span>
                    {t.customer_tier === "premium" && <TierBadge tier="premium" />}
                  </div>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={t.priority} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <TicketStatusBadge status={t.status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <p className="text-sm">{TEAM_LABEL[t.team]}</p>
                  <p className="text-xs text-muted-foreground">{t.assignee ?? "Unassigned"}</p>
                </TableCell>
                <TableCell>
                  <SlaIndicator ticket={t} />
                </TableCell>
                <TableCell className="hidden text-right text-xs text-muted-foreground xl:table-cell">{timeAgo(t.created_at)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-14 text-center">
                  <Inbox className="mx-auto mb-2 size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">No tickets here</p>
                  <p className="text-xs text-muted-foreground">
                    {filter === "active" ? "Nothing needs a human right now — the AI is handling it." : `No ${TICKET_STATUS[filter as TicketStatus]?.label.toLowerCase() ?? ""} tickets match your filters.`}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
