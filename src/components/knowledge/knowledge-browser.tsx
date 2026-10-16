"use client";

import { useMemo, useState, useTransition } from "react";
import { BookOpen, FileText, GitBranch, HelpCircle, Loader2, Scale, Search, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { publishArticle } from "@/app/actions";
import { Pill } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/ui-tokens";
import type { KbArticle, KbType } from "@/lib/types";

const TYPES: { value: KbType | "all"; label: string; icon: typeof BookOpen }[] = [
  { value: "all", label: "All", icon: BookOpen },
  { value: "troubleshooting", label: "Workflows", icon: GitBranch },
  { value: "policy", label: "Policies", icon: Scale },
  { value: "faq", label: "FAQs", icon: HelpCircle },
  { value: "product_doc", label: "Product docs", icon: FileText },
];
const TYPE_META: Record<KbType, { label: string; icon: typeof BookOpen; color: string }> = {
  troubleshooting: { label: "Workflow", icon: GitBranch, color: "bg-primary/10 text-primary" },
  policy: { label: "Policy", icon: Scale, color: "bg-warning/10 text-warning" },
  faq: { label: "FAQ", icon: HelpCircle, color: "bg-info/10 text-info" },
  product_doc: { label: "Product doc", icon: FileText, color: "bg-chart-2/10 text-chart-2" },
};

function ArticleCard({ a, onOpen }: { a: KbArticle; onOpen: () => void }) {
  const meta = TYPE_META[a.type];
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col gap-2.5 rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-7 items-center justify-center rounded-lg", meta.color)}>
          <meta.icon className="size-3.5" />
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">{meta.label}</span>
        {a.source === "auto" && (
          <Pill tone="brand" className="ml-auto">
            <Sparkles className="size-3" /> AI-generated
          </Pill>
        )}
        {a.workflow && <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{Math.round(a.workflow.reliability * 100)}% reliable</span>}
      </div>
      <p className="text-sm leading-snug font-semibold">{a.title}</p>
      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{a.content}</p>
      <div className="mt-auto flex flex-wrap gap-1">
        {a.intents.slice(0, 3).map((i) => (
          <span key={i} className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
            {humanize(i)}
          </span>
        ))}
      </div>
    </button>
  );
}

export function KnowledgeBrowser({ articles }: { articles: KbArticle[] }) {
  const [type, setType] = useState<KbType | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<KbArticle | null>(null);
  const [pending, start] = useTransition();

  const drafts = articles.filter((a) => a.status === "draft");
  const published = useMemo(() => {
    const query = q.trim().toLowerCase();
    return articles
      .filter((a) => a.status === "published")
      .filter((a) => type === "all" || a.type === type)
      .filter((a) => !query || `${a.title} ${a.content} ${a.tags.join(" ")}`.toLowerCase().includes(query));
  }, [articles, type, q]);

  return (
    <div className="space-y-5">
      {drafts.length > 0 && (
        <section className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Drafts from resolved conversations</h2>
            <span className="text-xs text-muted-foreground">Auto knowledge-base expansion — review & publish</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="line-clamp-4 text-xs text-muted-foreground">{a.content}</p>
                <div className="mt-auto flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setOpen(a)}>
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await publishArticle(a.id);
                        toast.success("Article published — agents can now use it");
                      })
                    }
                  >
                    {pending && <Loader2 className="animate-spin" />} Publish
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                type === t.value && "bg-background text-foreground shadow-sm",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles…" className="pl-8" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {published.map((a) => (
          <ArticleCard key={a.id} a={a} onOpen={() => setOpen(a)} />
        ))}
      </div>
      {published.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No articles match your search.</p>}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {open && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Pill tone="brand">{TYPE_META[open.type].label}</Pill>
                  {open.status === "draft" && <Pill tone="warning">Draft</Pill>}
                </div>
                <DialogTitle className="text-left">{open.title}</DialogTitle>
                <DialogDescription className="text-left">{open.tags.join(" · ")}</DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-relaxed">{open.content}</p>
              {open.workflow && (
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{open.workflow.name}</p>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(open.workflow.reliability * 100)}% reliable · {open.workflow.autoResolvable ? "auto-resolvable" : "may need a human"}
                    </span>
                  </div>
                  <ol className="space-y-2">
                    {open.workflow.steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-1 border-t pt-3">
                    {open.workflow.tools.map((t) => (
                      <code key={t} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10.5px] ring-1 ring-border">
                        {t}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
