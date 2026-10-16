"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { assignTicket, replyToTicket, updateTicketStatus } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TICKET_STATUS } from "@/lib/ui-tokens";
import { TEAM_LABEL } from "@/lib/team";
import type { Team, TicketStatus } from "@/lib/types";

const LIFECYCLE: TicketStatus[] = ["open", "assigned", "pending_customer", "resolved", "closed"];
const ACTION_LABEL: Partial<Record<TicketStatus, string>> = {
  assigned: "Assign / resume",
  pending_customer: "Wait on customer",
  resolved: "Mark resolved",
  closed: "Close ticket",
  open: "Return to queue",
};

export function LifecycleStepper({ status }: { status: TicketStatus }) {
  const idx = LIFECYCLE.indexOf(status);
  return (
    <ol className="flex w-full items-center">
      {LIFECYCLE.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={s} className={cn("flex items-center", i < LIFECYCLE.length - 1 && "flex-1")}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-primary bg-primary/10 text-primary ring-4 ring-primary/10",
                  !done && !current && "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-center text-[11px] whitespace-nowrap", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{TICKET_STATUS[s].label}</span>
            </div>
            {i < LIFECYCLE.length - 1 && <span className={cn("mx-1 mb-5 h-0.5 flex-1 rounded-full", i < idx ? "bg-primary" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}

export function StatusActions({ ticketId, next }: { ticketId: number; next: TicketStatus[] }) {
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<TicketStatus | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === "resolved" ? "default" : "outline"}
          disabled={pending}
          onClick={() => {
            setTarget(s);
            start(async () => {
              const res = await updateTicketStatus(ticketId, s);
              if (res.ok) toast.success(`Ticket moved to ${TICKET_STATUS[s].label} — customer notified`);
              else toast.error(res.error);
            });
          }}
        >
          {pending && target === s && <Loader2 className="animate-spin" />}
          {ACTION_LABEL[s] ?? TICKET_STATUS[s].label}
        </Button>
      ))}
    </div>
  );
}

export function AssignSelect({ ticketId, assignee, agents }: { ticketId: number; assignee: string | null; agents: { team: Team; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={assignee ?? ""}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await assignTicket(ticketId, v);
          if (res.ok) toast.success(`Assigned to ${v}`);
          else toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        {agents.map((a) => (
          <SelectItem key={a.name} value={a.name}>
            {a.name} <span className="text-muted-foreground">· {TEAM_LABEL[a.team]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReplyBox({ ticketId, defaultAgent, disabled }: { ticketId: number; defaultAgent: string; disabled: boolean }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const send = (awaitCustomer: boolean) =>
    start(async () => {
      const res = await replyToTicket(ticketId, defaultAgent, text, awaitCustomer);
      if (res.ok) {
        setText("");
        toast.success("Reply sent to the customer's chat");
      } else toast.error(res.error);
    });
  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled || pending}
        placeholder={disabled ? "This ticket has no linked conversation." : `Reply to the customer as ${defaultAgent}…`}
        className="min-h-24 resize-none"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={disabled || pending || !text.trim()} onClick={() => send(true)}>
          Send & wait on customer
        </Button>
        <Button size="sm" disabled={disabled || pending || !text.trim()} onClick={() => send(false)}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Send reply
        </Button>
      </div>
    </div>
  );
}
