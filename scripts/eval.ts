/**
 * End-to-end evaluation of the agent pipeline on the scenarios from the problem statement.
 * Reseeds the database, runs each scenario through the real orchestrator + Gemini, and checks the outcome.
 *   npm run eval                 # all scenarios
 *   npm run eval -- wrong fraud  # filter by id
 */
import { existsSync } from "node:fs";
for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

import { handleTurn, type OrchestratorEvent } from "@/lib/agents/orchestrator";
import { seed } from "@/lib/db/seed";
import { llmConfigured } from "@/lib/llm/gemini";

interface Case {
  id: string;
  customerId: string;
  message: string;
  intent: string[];
  mustCall?: string[];
  mustNotCall?: string[];
  escalate: boolean;
  team?: string;
}

const CASES: Case[] = [
  { id: "wrong-item", customerId: "cus_priya", message: "My order was delivered but I received the wrong item.", intent: ["wrong_item"], mustCall: ["compare_order_items", "create_replacement_order"], escalate: false },
  { id: "payment", customerId: "cus_marcus", message: "My payment failed but money was deducted from my account.", intent: ["payment_failure", "refund_request"], mustCall: ["initiate_refund"], escalate: false },
  { id: "login", customerId: "cus_sofia", message: "I can't log in to my account, it says it's locked.", intent: ["login_issue", "password_reset"], mustCall: ["unlock_account"], escalate: false },
  { id: "premium", customerId: "cus_john", message: "I paid for Premium a few hours ago but my subscription still isn't activated.", intent: ["subscription_issue"], mustCall: ["retry_subscription_sync"], escalate: true, team: "engineering" },
  { id: "fraud", customerId: "cus_liam", message: "There are two charges on my card from ELEC-STORE ONLINE that I never made!", intent: ["fraud_report"], mustNotCall: ["initiate_refund"], escalate: true, team: "trust_safety" },
  { id: "cancel-upgrade", customerId: "cus_aisha", message: "Please cancel my kettle order, and I'd also like to upgrade my plan to Premium.", intent: ["cancel_order", "plan_change"], mustCall: ["cancel_order", "upgrade_plan"], escalate: false },
];

const DELAY = Number(process.env.EVAL_DELAY_MS ?? 20_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  if (!llmConfigured()) {
    console.error(red("GEMINI_API_KEY is not set (.env.local). The eval needs the real model."));
    process.exit(1);
  }
  const filter = process.argv.slice(2);
  const cases = filter.length ? CASES.filter((c) => filter.some((f) => c.id.includes(f))) : CASES;
  seed();
  console.log(dim(`Seeded fresh data. Running ${cases.length} scenarios (${DELAY / 1000}s apart for the free-tier rate limit)…\n`));

  let passed = 0;
  for (const [i, c] of cases.entries()) {
    if (i > 0) await sleep(DELAY);
    const events: OrchestratorEvent[] = [];
    await handleTurn({ customerId: c.customerId, text: c.message }, (e) => events.push(e));
    const steps = new Map<string, Extract<OrchestratorEvent, { type: "step" }>["step"]>();
    for (const e of events) if (e.type === "step") steps.set(e.step.id, e.step);
    const intentStep = [...steps.values()].find((s) => s.agent === "intent");
    const intent = (intentStep?.data as { intent?: string } | undefined)?.intent ?? "?";
    const tools = [...steps.values()].map((s) => (s.data as { tool?: string } | undefined)?.tool).filter(Boolean) as string[];
    const ticket = events.find((e) => e.type === "ticket") as Extract<OrchestratorEvent, { type: "ticket" }> | undefined;
    const reply = events.find((e) => e.type === "message") as Extract<OrchestratorEvent, { type: "message" }> | undefined;
    const done = events.find((e) => e.type === "done") as Extract<OrchestratorEvent, { type: "done" }> | undefined;

    const failures: string[] = [];
    if (!c.intent.includes(intent)) failures.push(`intent ${intent} ∉ [${c.intent}]`);
    for (const t of c.mustCall ?? []) if (!tools.includes(t)) failures.push(`missing tool ${t}`);
    for (const t of c.mustNotCall ?? []) if (tools.includes(t)) failures.push(`should not call ${t}`);
    if (c.escalate !== Boolean(ticket)) failures.push(c.escalate ? "expected escalation" : `unexpected escalation (#${ticket?.ticket.id})`);
    if (c.team && ticket && ticket.ticket.team !== c.team) failures.push(`team ${ticket.ticket.team} ≠ ${c.team}`);
    if (intentStep?.status === "error") failures.push("intent agent fell back to heuristics (LLM error)");

    const ok = failures.length === 0;
    if (ok) passed++;
    console.log(`${ok ? green("PASS") : red("FAIL")} ${c.id}  ${dim(`intent=${intent} · ${done?.llmCalls ?? "?"} LLM calls · ${((done?.durationMs ?? 0) / 1000).toFixed(1)}s`)}`);
    console.log(dim(`     tools: ${tools.join(" → ") || "none"}${ticket ? ` · ticket #${ticket.ticket.id} (${ticket.ticket.team})` : ""}`));
    console.log(dim(`     reply: ${reply?.message.content.replace(/\s+/g, " ").slice(0, 160)}…`));
    for (const f of failures) console.log(red(`     ✗ ${f}`));
  }
  console.log(`\n${passed === cases.length ? green("✓") : red("✗")} ${passed}/${cases.length} scenarios passed`);
  process.exit(passed === cases.length ? 0 : 1);
}

main();
