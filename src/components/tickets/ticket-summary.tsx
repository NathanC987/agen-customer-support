import { CheckCircle2, Lightbulb, Route, Search, Zap } from "lucide-react";
import type { Ticket } from "@/lib/types";

function Block({ icon: Icon, title, children }: { icon: typeof Search; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {title}
      </h4>
      {children}
    </div>
  );
}

function Bullets({ items, icon }: { items: string[]; icon: "check" | "dot" }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm">
          {icon === "check" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /> : <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60" />}
          <span className="min-w-0 break-words">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** The structured, AI-written ticket body — designed so humans never need to reread the conversation. */
export function TicketSummary({ ticket }: { ticket: Ticket }) {
  return (
    <div className="space-y-4">
      <Block icon={Lightbulb} title="Issue">
        <p className="text-sm leading-relaxed">{ticket.issue}</p>
      </Block>
      <Block icon={Search} title="Investigation">
        <Bullets items={ticket.investigation} icon="dot" />
      </Block>
      <Block icon={Zap} title="Actions taken">
        <Bullets items={ticket.actions_taken} icon="check" />
      </Block>
      <Block icon={Route} title="Why escalated">
        <Bullets items={ticket.escalation_reasons} icon="dot" />
      </Block>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">Recommended next step</p>
        <p className="mt-1 text-sm">{ticket.recommended_next}</p>
      </div>
    </div>
  );
}
