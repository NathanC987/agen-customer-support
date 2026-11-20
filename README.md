# Nimbus Support — Agentic Customer Support System (PS-04)

A multi-agent support platform that **understands** a customer's issue, **gathers context**, **investigates**, **takes real actions**, **escalates intelligently** with a complete ticket, and **tracks resolution** — instead of a RAG chatbot that answers "please contact support".

Built with Next.js 16 (App Router, Cache Components), Tailwind v4 + shadcn/ui, SQLite (`node:sqlite`), and Google Gemini (free tier) via `@google/genai`.

## Quick start

```bash
npm install
cp .env.example .env.local     # add GEMINI_API_KEY (https://aistudio.google.com/apikey) and a JWT_SECRET
docker compose up -d           # Qdrant vector database on 127.0.0.1:6333
npm run db:seed                # demo data + users + inventory, then embeds the KB & catalog into Qdrant
npm run dev                    # http://localhost:3000 → sign in
```

Requires Node 22.5+ (built-in `node:sqlite`) and Docker (for Qdrant). If Qdrant is down the app keeps working with keyword search.

**Demo logins** (also listed on the sign-in page): admin `admin@nimbus.example` / `Admin@1234`; customers `priya.sharma@example.com`, `marcus.chen@example.com`, `sofia.alvarez@example.com`, `john.doe@example.com`, `liam.obrien@example.com`, `aisha.khan@example.com`, `alex.morgan@example.com` — all `Demo@1234`. New customers can sign up at `/signup`.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run db:seed` | Reset the database to the demo state and rebuild the vector index (admin UI: Settings → Reset demo data) |
| `npm run rag:index` | Re-embed the knowledge base + product catalog into Qdrant |
| `npm run test:security` | 16 deterministic checks (no LLM): refund policy, quote/confirm, exactly-once, duplicates, stock, scoping, injection scanner |
| `npm run eval` | The 6 problem-statement scenarios through the real orchestrator + Gemini |
| `npm run lint` / `npm run typecheck` / `npm run build` | Quality gates |

## Security & reliability (v2)

| Area | What's in place |
|---|---|
| **Authentication** | Sign-up / sign-in, scrypt password hashes, HS256 **JWT** in an httpOnly cookie (or `Authorization: Bearer`), login rate limiting. `src/proxy.ts` gates every page/API; every route handler and server action re-checks the session (`src/lib/auth/session.ts`). |
| **Authorization** | Two roles. Customers only ever see and act on their own record — the customer id comes from the JWT, never the request body; other customers' resources return 404. Admins get tickets, dashboard, inventory and KB; public sign-up can only create customers. |
| **Prompt injection** | 3 layers: (1) pattern scanner + spotlighting (customer text and retrieved docs wrapped as untrusted data), (2) the intent LLM also classifies manipulation → *guarded mode* disables every action tool for that turn, (3) money rules enforced in code: refunds need a verifiable reason + daily caps, spending needs customer confirmation. Output guard blocks system-prompt leaks (canary). Everything is logged to *Security events* on the dashboard. |
| **Confirm before spend** | `place_order` / `upgrade_plan` only create a quote; it executes when the customer presses **Confirm** (or replies "yes" in a later turn). |
| **No double actions** | Quotes execute exactly once (compare-and-set), chat messages carry an idempotency key, one turn per customer at a time, identical orders within 30 min are blocked, refunds/returns/cancellations/resets are idempotent, every action is one DB transaction, ids are collision-checked. |
| **Inventory** | 40 products in SQL with live stock; orders decrement atomically (no overselling), cancellations restock, replacements consume stock. Admin **Inventory** page: +/− counters and "Add product" (auto-embedded for search). |
| **RAG** | Qdrant vector DB + Gemini embeddings: KB articles are chunked and embedded; products are embedded for semantic search ("gift for someone with back pain" → ergonomic chair). Workflow selection combines similarity, intent and reliability. |

See **[SECURITY-DEMO.md](SECURITY-DEMO.md)** for a side-by-side attack demo of v1 vs v2.

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
