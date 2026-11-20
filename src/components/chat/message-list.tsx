"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, BadgeCheck, Bell, CheckCircle2, Headset, Loader2, ShieldAlert, ShoppingCart, Sparkles, Ticket as TicketIcon, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar, PriorityBadge, TicketStatusBadge } from "@/components/badges";
import { cn } from "@/lib/utils";
import { AGENTS } from "@/lib/ui-tokens";
import { TEAM_LABEL } from "@/lib/team";
import { RichText } from "./rich-text";
import type { Message, Ticket, TraceStep } from "@/lib/types";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function BotAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
      <Sparkles className="size-4" />
    </span>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="group mt-2 flex items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-chart-4/10 text-chart-4">
        <TicketIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">#{ticket.id}</span>
          <span className="truncate text-sm font-medium">{ticket.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="text-[11px] text-muted-foreground">{TEAM_LABEL[ticket.team]}</span>
        </div>
      </div>
      <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

function ActionChips({ actions }: { actions: NonNullable<Message["meta"]["actions"]> }) {
  return (
    <div className="mt-2 space-y-1">
      {actions.map((a, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-success/8 px-2.5 py-1.5 text-xs text-foreground ring-1 ring-success/20">
          <Zap className="mt-0.5 size-3.5 shrink-0 text-success" />
          <span className="min-w-0 flex-1">{a.summary}</span>
          {a.ref && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{a.ref}</span>}
        </div>
      ))}
    </div>
  );
}

type Pending = NonNullable<Message["meta"]["pendingAction"]>;

/** Explicit consent for spending: nothing is charged until the customer presses Confirm (or replies "yes"). */
function ConfirmCard({ pending, status, onDecide }: { pending: Pending; status?: string; onDecide?: (id: string, d: "confirm" | "cancel") => Promise<void> }) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const open = !status || status === "pending";
  const decide = async (d: "confirm" | "cancel") => {
    if (!onDecide || busy) return;
    setBusy(d);
    try {
      await onDecide(pending.id, d);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-2 w-full max-w-sm rounded-xl border bg-card p-3 text-sm shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ShoppingCart className="size-3.5" /> {pending.type === "place_order" ? "Order quote" : "Plan change quote"}
        <span className="ml-auto font-mono text-[10.5px]">{pending.id}</span>
      </div>
      {pending.lines?.length ? (
        <ul className="mb-2 space-y-0.5 text-xs">
          {pending.lines.map((l) => (
            <li key={l.sku} className="flex justify-between gap-3">
              <span className="truncate">{l.qty}× {l.name}</span>
              <span className="tabular-nums">${(l.qty * l.price).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs">{pending.summary}</p>
      )}
      <div className="mb-2.5 flex justify-between border-t pt-2 text-xs font-semibold">
        <span>{pending.amount < 0 ? "Credit" : "Total"}</span>
        <span className="tabular-nums">${Math.abs(pending.amount).toFixed(2)}</span>
      </div>
      {open ? (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => decide("confirm")} disabled={!!busy}>
            {busy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide("cancel")} disabled={!!busy}>
            {busy === "cancel" ? <Loader2 className="animate-spin" /> : <XCircle />} Cancel
          </Button>
        </div>
      ) : (
        <p className={cn("text-xs font-medium", status === "confirmed" ? "text-success" : "text-muted-foreground")}>
          {status === "confirmed" ? "✓ Confirmed" : status === "cancelled" ? "Cancelled — nothing charged" : status === "superseded" ? "Replaced by a newer quote" : `Quote ${status}`}
        </p>
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  ticket,
  customerName,
  pendingStatus,
  onDecide,
}: {
  message: Message;
  ticket: Ticket | null;
  customerName: string;
  pendingStatus?: string;
  onDecide?: (id: string, d: "confirm" | "cancel") => Promise<void>;
}) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="flex max-w-md items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Bell className="size-3.5 shrink-0 text-primary" />
          <span>{message.content}</span>
          <span className="shrink-0 opacity-60">{time(message.created_at)}</span>
        </div>
      </div>
    );
  }

  const isCustomer = message.role === "customer";
  const isHuman = message.role === "agent";
  return (
    <div className={cn("flex gap-2.5", isCustomer && "flex-row-reverse")}>
      {isCustomer ? (
        <PersonAvatar name={customerName} />
      ) : isHuman ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chart-2 text-white">
          <Headset className="size-4" />
        </span>
      ) : (
        <BotAvatar />
      )}
      <div className={cn("flex max-w-[78%] min-w-0 flex-col", isCustomer && "items-end")}>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">{isCustomer ? customerName : isHuman ? "Support specialist" : "Nova · AI agent"}</span>
          {isHuman && <BadgeCheck className="size-3 text-chart-2" />}
          {message.meta.guarded && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              <ShieldAlert className="size-3" /> Guardrail
            </span>
          )}
          <span>{time(message.created_at)}</span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm",
            isCustomer
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : isHuman
                ? "rounded-tl-sm bg-chart-2/10 ring-1 ring-chart-2/25"
                : "rounded-tl-sm bg-card ring-1 ring-foreground/10",
            message.meta.error && "bg-destructive/10 ring-destructive/30",
          )}
        >
          <RichText text={message.content} />
        </div>
        {!isCustomer && message.meta.actions && message.meta.actions.length > 0 && <ActionChips actions={message.meta.actions} />}
        {!isCustomer && message.meta.pendingAction && <ConfirmCard pending={message.meta.pendingAction} status={pendingStatus} onDecide={onDecide} />}
        {!isCustomer && ticket && message.meta.ticketId === ticket.id && message.role === "assistant" && <TicketCard ticket={ticket} />}
      </div>
    </div>
  );
}

/** Live "thinking" indicator that names the agent currently working. */
export function TypingIndicator({ step }: { step: TraceStep | undefined }) {
  const meta = step ? AGENTS[step.agent] : null;
  return (
    <div className="flex gap-2.5">
      <BotAvatar />
      <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-sm bg-card px-3.5 py-2.5 ring-1 ring-foreground/10">
        <span className="flex gap-1">
          <span className="typing-dot size-1.5 rounded-full bg-primary" />
          <span className="typing-dot size-1.5 rounded-full bg-primary" />
          <span className="typing-dot size-1.5 rounded-full bg-primary" />
        </span>
        <span className="text-xs text-muted-foreground">
          {meta ? (
            <>
              <span className="font-medium text-foreground/80">{meta.label}</span> · {step!.title.toLowerCase()}
            </>
          ) : (
            "Thinking…"
          )}
        </span>
      </div>
    </div>
  );
}
