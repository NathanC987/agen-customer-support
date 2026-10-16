import {
  AlertTriangle,
  Bot,
  Brain,
  BookOpen,
  Clock,
  Database,
  GitBranch,
  History,
  MessageSquareReply,
  Route,
  Search,
  Ticket,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AgentName, ConversationStatus, Priority, Sentiment, TicketStatus } from "@/lib/types";

/** Every colored badge in the app comes from these maps so the palette stays consistent. */
const tone = {
  neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-foreground/10",
  brand: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
  info: "bg-info/10 text-info ring-1 ring-inset ring-info/20",
  success: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
  warning: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/25",
  danger: "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20",
} as const;
export type Tone = keyof typeof tone;
export const toneClass = (t: Tone) => tone[t];

export const PRIORITY_TONE: Record<Priority, Tone> = { low: "neutral", medium: "info", high: "warning", urgent: "danger" };
export const SENTIMENT_TONE: Record<Sentiment, Tone> = { positive: "success", neutral: "neutral", negative: "warning", angry: "danger" };
export const SENTIMENT_EMOJI: Record<Sentiment, string> = { positive: "🙂", neutral: "😐", negative: "😕", angry: "😠" };

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "info" },
  assigned: { label: "Assigned", tone: "brand" },
  pending_customer: { label: "Pending customer", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const CONVERSATION_STATUS: Record<ConversationStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "info" },
  awaiting_customer: { label: "Awaiting reply", tone: "neutral" },
  resolved: { label: "Resolved", tone: "success" },
  escalated: { label: "Escalated", tone: "warning" },
};

export const AGENTS: Record<AgentName, { label: string; icon: LucideIcon; color: string }> = {
  orchestrator: { label: "Orchestrator", icon: GitBranch, color: "text-primary bg-primary/10" },
  memory: { label: "Memory Agent", icon: History, color: "text-chart-5 bg-chart-5/10" },
  intent: { label: "Intent Agent", icon: Brain, color: "text-primary bg-primary/10" },
  context: { label: "Context Agent", icon: Database, color: "text-chart-2 bg-chart-2/10" },
  knowledge: { label: "Knowledge Agent", icon: BookOpen, color: "text-chart-5 bg-chart-5/10" },
  troubleshooting: { label: "Troubleshooting Agent", icon: Search, color: "text-chart-2 bg-chart-2/10" },
  action: { label: "Action Agent", icon: Zap, color: "text-success bg-success/10" },
  escalation: { label: "Escalation Agent", icon: Route, color: "text-warning bg-warning/10" },
  ticket: { label: "Ticket Agent", icon: Ticket, color: "text-chart-4 bg-chart-4/10" },
  tracking: { label: "Tracking Agent", icon: Wrench, color: "text-muted-foreground bg-muted" },
  sla: { label: "SLA Monitor", icon: Clock, color: "text-warning bg-warning/10" },
  response: { label: "Response", icon: MessageSquareReply, color: "text-primary bg-primary/10" },
};

export const BotIcon = Bot;
export const AlertIcon = AlertTriangle;

export const humanize = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "—";
  const m = ms / 60_000;
  if (m < 1) return `${Math.round(ms / 1000)}s`;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Stable avatar gradient per person. */
const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
];
export function avatarGradient(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}
