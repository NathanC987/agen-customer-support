# Nimbus Support — Agentic Customer Support System (PS-04)

A multi-agent support platform that **understands** a customer's issue, **gathers context**, **investigates**, **takes real actions**, **escalates intelligently** with a complete ticket, and **tracks resolution** — instead of a RAG chatbot that answers "please contact support".

Built with Next.js 16 (App Router, Cache Components), Tailwind v4 + shadcn/ui, SQLite (`node:sqlite`), and Google Gemini (free tier) via `@google/genai`.

## Quick start

```bash
npm install
cp .env.example .env.local     # add your free key from https://aistudio.google.com/apikey
npm run db:seed                # demo customers, knowledge base, 14 days of history
npm run dev                    # http://localhost:3000
```

Requires Node 22.5+ (uses the built-in `node:sqlite`; no native modules).
Without a key the app still runs in **heuristic fail-safe mode**: intent is classified by rules and every case is escalated to a human with a templated ticket.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run db:seed` | Reset the database to the demo state (also available in the UI: Settings → Reset demo data) |
| `npm run eval` | Runs the 6 problem-statement scenarios through the real orchestrator + Gemini and checks intent, tool calls and escalation (paced 20 s apart for free-tier limits; `EVAL_DELAY_MS` to change) |
| `npm run lint` / `npm run typecheck` / `npm run build` | Quality gates |

## Free-form chat

Besides the scenarios, you can chat with Nova as any customer like a normal assistant (try the suggestion chips in an empty chat). Nova sees the customer's full profile (orders, transactions, plan and renewal, actions on file, tickets) plus the conversation, and can:

- answer questions ("How can you help me?", "What do you know about the AuraSound headphones?", "What did I order last month?")
- do things **without a ticket**: place an order from the catalog, cancel a processing order (auto-refund), returns/replacements, refunds ≤ $500, plan upgrades/downgrades (prorated), password resets and unlocks

A ticket is only created when a human is genuinely needed: approval limits (refund > $500, order > $1000), fraud/legal/security, a failed fix or low confidence (< 70%), or the customer insisting on a human. Every action updates the customer panel immediately and counts toward "AI actions" on the dashboard.

## The agent pipeline

```
Customer message
   │
   ▼
Master Orchestrator ── streams every step to the UI (SSE) ──────────────────────────┐
   │                                                                                 │
   ├─ 6  Memory Agent         transcript + issue state (intent, entities, actions)   │
   ├─ 1  Intent Agent    LLM  intent · category · priority · sentiment · confidence  │
   ├─ 2  Context Agent        account, orders, tickets, subscription, transactions   │
   ├─ 7a Escalation pre-check fraud / legal / breach / "human please" / angry+repeat │
   ├─ 3  Knowledge Agent      ranks articles AND selects the most reliable workflow  │
   ├─ 4  Troubleshooting  ┐   LLM function-calling loop guided by the workflow:      │
   ├─ 5  Action Execution ┘   read tools to investigate, action tools to fix         │
   ├─ 7b Escalation decision  resolver request · confidence < 70% · failed fixes     │
   ├─ 8  Ticket Agent    LLM  structured ticket: issue, investigation, actions, next │
   ├─    SLA Monitor          15 min premium / tiered standard, auto-escalate at risk │
   ├─ 9  Resolution Tracking  Opened → Assigned → Pending → Resolved → Closed,       │
   │                          each change auto-posts an update into the chat         │
   └─ 10 Satisfaction Agent   CSAT + sentiment + resolution quality → dashboard  ◄───┘
```

**Free-tier budget:** only the agents that need reasoning call the LLM (intent, resolver loop, ticket writer), so a typical turn costs **2–4 Gemini calls**. Everything else is deterministic, fast and auditable. Gemini 429/5xx responses are retried with backoff; if the model stays unavailable the orchestrator **fails safe** to a human with a templated ticket rather than guessing.

**Guardrails in the tools, not just the prompt:** every tool is scoped to the current customer; refunds above $500 return `requires_approval`; security locks can't be lifted by automation; replacements/returns are idempotent.

### Tools available to the resolver

| Investigate (Troubleshooting Agent) | Act (Action Execution Agent) |
|---|---|
| `list_recent_orders`, `get_order`, `get_shipment`, `compare_order_items`, `check_return_eligibility`, `get_transactions` (flags anomalies), `get_account_status`, `get_subscription`, `search_knowledge_base` | `cancel_order` (auto-refund), `create_return_request`, `generate_return_label`, `create_replacement_order`, `initiate_refund` (≤ $500), `reset_password`, `unlock_account`, `retry_subscription_sync`, `reactivate_subscription`, `upgrade_plan` |

Control tools: `request_human_escalation(reason, team)` and `report_outcome(status, summary, confidence)`.

## Product surfaces

- **Support Chat** (`/chat`) — act as any demo customer. Center: chat with action receipts and ticket cards. Right: the **live agent trace** (pipeline map + every step with inspectable JSON), the customer context and issue memory, and the ticket. CSAT appears once the issue is resolved.
- **Tickets** (`/tickets`, `/tickets/[id]`) — the human agent console: AI case summary (no need to reread the chat), lifecycle stepper, assignment, replies that land in the customer's chat, SLA countdowns, activity log, optional transcript.
- **Supervisor Dashboard** (`/dashboard`) — open tickets, resolution rate, AI auto-resolution, avg resolution time, escalation rate, CSAT, daily outcomes, sentiment, top issues, SLA watchlist and **root-cause alerts** (e.g. *Spike in payment failures → possible gateway outage*).
- **Knowledge Base** (`/knowledge`) — FAQs, policies, product docs and the troubleshooting workflows (steps, tools, reliability). Resolved chats can be turned into **draft FAQ articles** (auto KB expansion) and published.

## Demo script

Each scenario card in the empty chat switches to a seeded customer whose data triggers that flow:

| Scenario | Customer | Expected behaviour |
|---|---|---|
| Wrong item delivered | Priya (standard) | Finds ORD12345, verifies delivery, detects SKU mismatch, creates return + label + express replacement → **auto-resolved** |
| Payment failed, money deducted | Marcus (premium) | Spots gateway `captured` on a `payment_failed` order → refunds $249.99 → **auto-resolved** |
| Unable to log in | Sofia (standard) | Account locked after 5 attempts → unlocks + sends reset link → **auto-resolved** |
| Premium not activated | John Doe (premium, 3 prior tickets) | Payment OK, sync failed → retries sync → still fails (ENT-504) → **Engineering ticket**, 15 min SLA |
| Unrecognized charges | Liam (standard) | Mandatory escalation: gathers the suspicious transactions, no actions → **Trust & Safety ticket** (urgent) |
| Cancel order & upgrade | Aisha (premium) | Two actions in one turn: cancels a processing order (auto-refund) and upgrades Pro → Premium |
| *(free-form)* | Alex Morgan (standard, blank) | No scenario data: active account, free plan, no orders or tickets. Use it to ask anything and show the agent investigating honestly (e.g. finds no orders and asks for an order ID instead of inventing one) |

Then open the ticket, assign it or change its status, and watch the update appear in the customer's chat. Submit CSAT and see it on the dashboard.

## Project structure

```
src/
  app/
    (app)/chat | tickets | tickets/[id] | dashboard | knowledge   pages
    api/chat/route.ts            SSE endpoint → orchestrator
    api/customers, api/conversations   data for the chat workspace
    actions.ts                   server actions (ticket lifecycle, CSAT, KB, reset)
  lib/
    agents/                      orchestrator, intent, context, knowledge, resolver,
                                 escalation, ticket, tracking, sla, satisfaction,
                                 insights (metrics + root cause), kb-expansion, memory
    tools/                       tool declarations + DB-backed implementations
    llm/gemini.ts                Gemini client: structured output, tool loop, retries
    db/                          schema, repository, seed data (customers, KB, history)
  components/                    chat, trace, tickets, dashboard, knowledge, shell, ui (shadcn)
scripts/                         seed.ts, eval.ts
```

## Out of scope for this MVP

Real omnichannel connectors (conversations already carry a `channel` field), authentication/roles, vector embeddings for retrieval, outbound email/SMS notifications.
