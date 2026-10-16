import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONVERSATION_STATUS,
  PRIORITY_TONE,
  SENTIMENT_EMOJI,
  SENTIMENT_TONE,
  TICKET_STATUS,
  avatarGradient,
  humanize,
  initials,
  toneClass,
  type Tone,
} from "@/lib/ui-tokens";
import type { ConversationStatus, Priority, Sentiment, TicketStatus, Tier } from "@/lib/types";

export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap", toneClass(tone), className)}>
      {children}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <Pill tone={PRIORITY_TONE[priority]} className={className}>
      <span className="size-1.5 rounded-full bg-current" />
      {humanize(priority)}
    </Pill>
  );
}

export function SentimentBadge({ sentiment, className }: { sentiment: Sentiment; className?: string }) {
  return (
    <Pill tone={SENTIMENT_TONE[sentiment]} className={className}>
      <span aria-hidden>{SENTIMENT_EMOJI[sentiment]}</span>
      {humanize(sentiment)}
    </Pill>
  );
}

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const s = TICKET_STATUS[status];
  return (
    <Pill tone={s.tone} className={className}>
      {s.label}
    </Pill>
  );
}

export function ConversationStatusBadge({ status, className }: { status: ConversationStatus; className?: string }) {
  const s = CONVERSATION_STATUS[status];
  return (
    <Pill tone={s.tone} className={className}>
      {s.label}
    </Pill>
  );
}

export function TierBadge({ tier, className }: { tier: Tier | string; className?: string }) {
  if (tier !== "premium") return <Pill className={className}>Standard</Pill>;
  return (
    <Pill tone="warning" className={className}>
      <Crown className="size-3" />
      Premium
    </Pill>
  );
}

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-white",
        avatarGradient(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
