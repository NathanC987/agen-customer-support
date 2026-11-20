"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowUp, BookPlus, Cpu, Loader2, MessageSquarePlus, PanelLeft, PanelRight, Ticket as TicketIcon, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateKbArticle } from "@/app/actions";
import { ConversationStatusBadge, PersonAvatar, Pill, PriorityBadge, SentimentBadge, TicketStatusBadge, TierBadge } from "@/components/badges";
import { TracePanel } from "@/components/trace/trace-panel";
import { TicketSummary } from "@/components/tickets/ticket-summary";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { humanize, timeAgo } from "@/lib/ui-tokens";
import { CsatCard } from "./csat-card";
import { CustomerPanel } from "./customer-panel";
import { MessageBubble, TypingIndicator } from "./message-list";
import { SCENARIOS } from "./scenarios";
import type { ConversationDetail, Customer, CustomerDetail, LiveRun } from "./types";
import type { Message, Ticket, TraceStep } from "@/lib/types";
import type { OrchestratorEvent } from "@/lib/agents/orchestrator";

export function ChatWorkspace({ customers, llmReady, model }: { customers: Customer[]; llmReady: boolean; model: string }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [convo, setConvo] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [live, setLive] = useState<LiveRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState("trace");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [drafting, startDraft] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const customer = customers.find((c) => c.id === customerId);

  const loadCustomer = useCallback(async (id: string) => {
    const res = await fetch(`/api/customers/${id}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data: ConversationDetail = await res.json();
    setConvo(data);
    setMessages(data.messages);
    setTicket(data.ticket);
  }, []);

  const resetChat = useCallback(() => {
    setConversationId(null);
    setConvo(null);
    setMessages([]);
    setTicket(null);
    setLive(null);
  }, []);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    fetch(`/api/customers/${customerId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CustomerDetail | null) => {
        if (!cancelled && d) setDetail(d);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const selectCustomer = useCallback(
    (id: string) => {
      if (id === customerId) return;
      resetChat();
      setDetail(null);
      setCustomerId(id);
    },
    [customerId, resetChat],
  );

  // escalated conversations receive human updates — poll for them
  useEffect(() => {
    if (!conversationId || busy || convo?.conversation.status !== "escalated") return;
    const t = setInterval(() => loadConversation(conversationId), 5000);
    return () => clearInterval(t);
  }, [conversationId, busy, convo?.conversation.status, loadConversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, live?.steps.length, busy]);

  const send = useCallback(
    async (text: string, asCustomer = customerId, convOverride?: string | null) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !asCustomer) return;
      setBusy(true);
      setInput("");
      setTab("trace");
      const tempId = `temp_${Date.now()}`;
      setMessages((m) => [...m, { id: tempId, conversation_id: "", role: "customer", content: trimmed, created_at: new Date().toISOString(), meta: {} }]);
      setLive({ steps: [], startedAt: Date.now(), done: false });
      const startConversation = convOverride === undefined ? conversationId : convOverride;
      let activeId = startConversation;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: asCustomer, conversationId: startConversation, message: trimmed }),
        });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "Request failed");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.replace(/^data: /, "");
            if (!line) continue;
            const e = JSON.parse(line) as OrchestratorEvent;
            switch (e.type) {
              case "conversation":
                activeId = e.conversation.id;
                setConversationId(e.conversation.id);
                break;
              case "user_message":
                setMessages((m) => m.map((x) => (x.id === tempId ? e.message : x)));
                break;
              case "step":
                setLive((l) => {
                  if (!l) return l;
                  const idx = l.steps.findIndex((s) => s.id === e.step.id);
                  const steps: TraceStep[] = idx === -1 ? [...l.steps, e.step] : l.steps.map((s, i) => (i === idx ? e.step : s));
                  return { ...l, steps };
                });
                break;
              case "ticket":
                setTicket(e.ticket);
                break;
              case "message":
                setMessages((m) => [...m, e.message]);
                break;
              case "done":
                setLive((l) => (l ? { ...l, done: true, llmCalls: e.llmCalls, durationMs: e.durationMs } : l));
                break;
              case "error":
                toast.error(e.error);
                break;
            }
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
        setMessages((m) => m.filter((x) => x.id !== tempId));
      } finally {
        setBusy(false);
        if (activeId) await loadConversation(activeId);
        await loadCustomer(asCustomer);
        setLive(null);
      }
    },
    [busy, conversationId, customerId, loadConversation, loadCustomer],
  );

  const runScenario = (s: (typeof SCENARIOS)[number]) => {
    if (s.customerId !== customerId) {
      selectCustomer(s.customerId);
      // let the customer switch commit before sending
      setTimeout(() => send(s.message, s.customerId, null), 50);
    } else send(s.message);
  };

  const status = convo?.conversation.status;
  const currentStep = live?.steps.filter((s) => s.status === "running").at(-1) ?? live?.steps.at(-1);
  const issue = convo?.conversation.issue_state ?? null;

  const promptByMessage = useMemo(() => {
    const map = new Map<string, string>();
    let lastCustomer = "";
    for (const m of messages) {
      if (m.role === "customer") lastCustomer = m.content;
      else if (m.role === "assistant") map.set(m.id, lastCustomer);
    }
    return map;
  }, [messages]);

  const draftArticle = () =>
    startDraft(async () => {
      if (!conversationId) return;
      const res = await generateKbArticle(conversationId);
      if (res.ok) toast.success("Draft FAQ article created", { action: { label: "Review", onClick: () => router.push("/knowledge") } });
      else toast.error(res.error);
    });

  /* ---------------- panels ---------------- */

  const leftPanel = (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-3">
        <label className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Chatting as</label>
        <Select value={customerId} onValueChange={(v) => { selectCustomer(v); setLeftOpen(false); }}>
          <SelectTrigger className="h-auto! w-full py-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id} className="py-1.5">
                <span className="flex items-center gap-2">
                  <PersonAvatar name={c.name} className="size-6 text-[9px]" />
                  <span className="flex flex-col items-start">
                    <span className="text-sm leading-tight">{c.name}</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">{c.scenario}</span>
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="w-full justify-start" onClick={() => { resetChat(); setLeftOpen(false); }}>
          <MessageSquarePlus /> New conversation
        </Button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        <p className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">History</p>
        {detail?.conversations.length === 0 && <p className="px-2 text-xs text-muted-foreground">No previous conversations.</p>}
        <ul className="space-y-0.5">
          {detail?.conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => { setConversationId(c.id); loadConversation(c.id); setLeftOpen(false); }}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted",
                  c.id === conversationId && "bg-accent text-accent-foreground hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{humanize(c.intent) || "New conversation"}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(c.updated_at)}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.last_message ?? "—"}</p>
                <div className="mt-1.5">
                  <ConversationStatusBadge status={c.status} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const rightPanel = (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col gap-0">
      <div className="border-b px-3 py-2">
        <TabsList className="w-full">
          <TabsTrigger value="trace">
            <Cpu /> Agent trace
          </TabsTrigger>
          <TabsTrigger value="customer">
            <User /> Customer
          </TabsTrigger>
          <TabsTrigger value="ticket" disabled={!ticket}>
            <TicketIcon /> Ticket
          </TabsTrigger>
        </TabsList>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
        <TabsContent value="trace" className="mt-0">
          <TracePanel runs={convo?.runs ?? []} live={live} messagesById={promptByMessage} />
        </TabsContent>
        <TabsContent value="customer" className="mt-0">
          <CustomerPanel detail={detail} issue={issue} />
        </TabsContent>
        <TabsContent value="ticket" className="mt-0">
          {ticket && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">#{ticket.id}</span>
                  <TicketStatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                </div>
                <p className="font-semibold">{ticket.title}</p>
                <Pill tone="brand">{ticket.status_label}</Pill>
              </div>
              <TicketSummary ticket={ticket} />
              <Button asChild variant="outline" className="w-full">
                <Link href={`/tickets/${ticket.id}`}>Open in agent console</Link>
              </Button>
            </div>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );

  /* ---------------- layout ---------------- */

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
        <SidebarTrigger />
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setLeftOpen(true)} aria-label="Conversations">
          <PanelLeft />
        </Button>
        {customer && (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <PersonAvatar name={customer.name} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold">{customer.name}</p>
                <TierBadge tier={customer.tier} className="hidden sm:inline-flex" />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {status ? <ConversationStatusBadge status={status} /> : <span>New conversation</span>}
                {convo?.conversation.intent && <span className="hidden truncate md:inline">· {humanize(convo.conversation.intent)}</span>}
                {convo?.conversation.sentiment && <SentimentBadge sentiment={convo.conversation.sentiment} className="hidden md:inline-flex" />}
              </div>
            </div>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex", llmReady ? "text-foreground/80" : "border-warning/30 bg-warning/10 text-warning")}>
              <span className={cn("size-1.5 rounded-full", llmReady ? "bg-success" : "bg-warning")} />
              {llmReady ? model : "Heuristic mode"}
            </span>
          </TooltipTrigger>
          <TooltipContent>{llmReady ? "Agents powered by Google Gemini" : "Add GEMINI_API_KEY to .env.local to enable LLM reasoning"}</TooltipContent>
        </Tooltip>
        {status === "resolved" && (
          <Button variant="outline" size="sm" onClick={draftArticle} disabled={drafting} className="hidden md:inline-flex">
            {drafting ? <Loader2 className="animate-spin" /> : <BookPlus />} Draft KB article
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={() => setRightOpen(true)} aria-label="Agent trace">
          <PanelRight />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r bg-sidebar/40 lg:block">{leftPanel}</aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="scrollbar-thin bg-grid flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
              {messages.length === 0 ? (
                <EmptyState customerId={customerId} onPick={runScenario} onAsk={(q) => send(q)} disabled={busy} />
              ) : (
                messages.map((m) => <MessageBubble key={m.id} message={m} ticket={ticket} customerName={customer?.name ?? "Customer"} />)
              )}
              {busy && <TypingIndicator step={currentStep} />}
              {!busy && status === "resolved" && conversationId && (
                <CsatCard key={conversationId} conversationId={conversationId} existing={convo?.csat ?? null} onSubmitted={() => loadConversation(conversationId)} />
              )}
            </div>
          </div>

          <div className="border-t bg-background p-3">
            <form
              className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={busy ? "Agents are working…" : `Message Nimbus Support as ${customer?.name.split(" ")[0] ?? "customer"}…`}
                disabled={busy}
                rows={1}
                className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent! px-2 py-1.5 shadow-none focus-visible:ring-0"
              />
              <Button type="submit" size="icon" disabled={busy || !input.trim()} className="rounded-xl" aria-label="Send">
                {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </form>
            <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-muted-foreground">
              Enter to send · Shift+Enter for a new line · Every step is visible in the agent trace →
            </p>
          </div>
        </main>

        <aside className="hidden w-[400px] shrink-0 border-l bg-sidebar/40 xl:block">{rightPanel}</aside>
      </div>

      <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          {leftPanel}
        </SheetContent>
      </Sheet>
      <Sheet open={rightOpen} onOpenChange={setRightOpen}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Agent insights</SheetTitle>
          </SheetHeader>
          {rightPanel}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const QUICK_PROMPTS = [
  "What can you help me with?",
  "What are my recent orders and charges?",
  "What do you know about the AuraSound headphones?",
  "I'd like to buy a Nimbus Smart Desk Lamp",
  "What's the difference between Pro and Premium?",
  "Downgrade my plan to Free",
];

function EmptyState({
  customerId,
  onPick,
  onAsk,
  disabled,
}: {
  customerId: string;
  onPick: (s: (typeof SCENARIOS)[number]) => void;
  onAsk: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="py-6">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
          <MessageSquarePlus className="size-5" />
        </span>
        <h2 className="text-lg font-semibold">How can we help today?</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Chat freely as the selected customer — Nova knows their orders, payments and plan, and can answer questions or get things done. Or run a scenario from the problem statement below.
        </p>
      </div>
      <div className="mb-6 flex flex-wrap justify-center gap-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onAsk(q)}
            className="rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      <p className="mb-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Problem-statement scenarios</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {SCENARIOS.map((s) => {
          const suggested = s.customerId === customerId;
          return (
            <button
              key={s.title}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              className={cn(
                "group flex gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:opacity-50",
                suggested && "border-primary/40 ring-2 ring-primary/15",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{s.title}</span>
                  {suggested && <Pill tone="brand">Current customer</Pill>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">“{s.message}”</span>
                <span className="mt-1.5 block text-[11px] font-medium text-primary/80">{s.expected}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
