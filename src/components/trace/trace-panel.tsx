"use client";

import { useState } from "react";
import { Check, ChevronRight, CircleDashed, Cpu, Loader2, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENTS } from "@/lib/ui-tokens";
import type { AgentName, AgentRun, TraceStep } from "@/lib/types";
import type { LiveRun } from "@/components/chat/types";

const PIPELINE: { key: AgentName[]; label: string }[] = [
  { key: ["intent"], label: "Intent" },
  { key: ["context", "memory"], label: "Context" },
  { key: ["knowledge"], label: "Knowledge" },
  { key: ["troubleshooting"], label: "Investigate" },
  { key: ["action"], label: "Act" },
  { key: ["escalation"], label: "Decide" },
  { key: ["ticket", "sla"], label: "Ticket" },
  { key: ["response"], label: "Respond" },
];

function PipelineMap({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PIPELINE.map((stage, i) => {
        const hits = steps.filter((s) => stage.key.includes(s.agent));
        const running = hits.some((s) => s.status === "running");
        const errored = hits.length > 0 && hits.every((s) => s.status === "error");
        const done = hits.some((s) => s.status === "done");
        return (
          <div key={stage.label} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                running && "animate-pulse bg-primary/15 text-primary",
                !running && done && "bg-primary text-primary-foreground",
                !running && !done && errored && "bg-destructive/15 text-destructive",
                !hits.length && "bg-muted text-muted-foreground/70",
              )}
            >
              {stage.label}
            </span>
            {i < PIPELINE.length - 1 && <ChevronRight className="size-3 text-muted-foreground/40" />}
          </div>
        );
      })}
    </div>
  );
}

function StatusIcon({ status }: { status: TraceStep["status"] }) {
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-primary" />;
  if (status === "error") return <X className="size-3.5 text-destructive" />;
  if (status === "skipped") return <CircleDashed className="size-3.5 text-muted-foreground" />;
  return <Check className="size-3.5 text-success" />;
}

function StepRow({ step, last }: { step: TraceStep; last: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = AGENTS[step.agent];
  const Icon = meta.icon;
  const hasData = step.data !== undefined && step.data !== null;
  return (
    <li className="relative pl-9">
      {!last && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-border" />}
      <span className={cn("absolute top-1 left-0 flex size-7 items-center justify-center rounded-lg", meta.color)}>
        <Icon className="size-3.5" />
      </span>
      <button
        type="button"
        disabled={!hasData}
        onClick={() => setOpen((o) => !o)}
        className={cn("group w-full rounded-lg px-2 py-1.5 text-left transition-colors", hasData && "hover:bg-muted/60")}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{step.title}</span>
          {step.durationMs !== undefined && step.status !== "running" && step.durationMs > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}</span>
          )}
          <StatusIcon status={step.status} />
        </div>
        <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
          <span className="shrink-0 text-[10px] font-medium tracking-wide uppercase opacity-70">{meta.label}</span>
        </div>
        {step.summary && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{step.summary}</p>}
        {hasData && (
          <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
            {open ? "Hide" : "Inspect"} details
          </span>
        )}
      </button>
      {open && hasData && (
        <pre className="scrollbar-thin mx-2 mb-2 max-h-72 overflow-auto rounded-lg border bg-muted/40 p-2.5 font-mono text-[10.5px] leading-relaxed text-foreground/80">
          {JSON.stringify(step.data, null, 2)}
        </pre>
      )}
    </li>
  );
}

function RunGroup({ title, steps, llmCalls, durationMs, defaultOpen, live }: { title: string; steps: TraceStep[]; llmCalls?: number; durationMs?: number; defaultOpen: boolean; live?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
        {live && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
        {llmCalls !== undefined && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Cpu className="size-3" /> {llmCalls}
          </span>
        )}
        {durationMs !== undefined && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
            <Timer className="size-3" /> {(durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 pt-3 pb-2">
          <PipelineMap steps={steps} />
          <ol className="space-y-0.5">
            {steps.map((s, i) => (
              <StepRow key={s.id} step={s} last={i === steps.length - 1} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

export function TracePanel({ runs, live, messagesById }: { runs: AgentRun[]; live: LiveRun | null; messagesById: Map<string, string> }) {
  const ordered = [...runs].reverse();
  if (!live && ordered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Cpu className="size-5" />
        </span>
        <p className="text-sm font-medium">No agent activity yet</p>
        <p className="text-xs text-muted-foreground">Send a message to watch the orchestrator route it through intent, context, knowledge, actions and escalation in real time.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {live && !live.done && <RunGroup key="live" title="Processing latest message…" steps={live.steps} defaultOpen live />}
      {ordered.map((r, i) => {
        const msg = r.message_id ? messagesById.get(r.message_id) : undefined;
        return (
          <RunGroup
            key={r.id}
            title={`Turn ${runs.length - i}${msg ? ` · “${msg.slice(0, 42)}${msg.length > 42 ? "…" : ""}”` : ""}`}
            steps={r.steps}
            llmCalls={r.llm_calls}
            durationMs={r.duration_ms}
            defaultOpen={i === 0 && !(live && !live.done)}
          />
        );
      })}
    </div>
  );
}
