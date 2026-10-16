"use client";

import { Clock } from "lucide-react";
import { Pill } from "@/components/badges";
import { slaState } from "@/lib/agents/sla";
import { useNow } from "@/hooks/use-now";

type SlaInput = { created_at: string; sla_due_at: string; first_response_at: string | null; status: string };

function remaining(ms: number) {
  const abs = Math.abs(ms);
  const m = Math.floor(abs / 60_000);
  const text = m >= 120 ? `${Math.round(m / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return ms < 0 ? `${text} over` : `${text} left`;
}

export function SlaIndicator({ ticket, className }: { ticket: SlaInput; className?: string }) {
  const now = useNow();
  if (now === null) return <Pill className={className}>—</Pill>;

  const state = slaState(ticket, now);
  const due = Date.parse(ticket.sla_due_at) - now;
  if (state === "met") return <Pill tone="success" className={className}>SLA met</Pill>;
  if (state === "breached")
    return (
      <Pill tone="danger" className={className}>
        <Clock className="size-3" /> {ticket.first_response_at ? "Breached" : remaining(due)}
      </Pill>
    );
  return (
    <Pill tone={state === "at_risk" ? "warning" : "neutral"} className={className}>
      <Clock className="size-3" /> {remaining(due)}
    </Pill>
  );
}
