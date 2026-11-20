import { randomBytes } from "node:crypto";

/**
 * Prompt-injection defence, layer 1 (deterministic): input scanning, delimiter neutralising, and
 * output leak detection. Layer 2 is the LLM's own classification (IntentSchema.injection_attempt);
 * layer 3 — the one that actually protects money — is server-side policy in the tools
 * (confirmation, limits, eligibility checks) that no prompt can change.
 */

export interface InjectionScan {
  flagged: boolean;
  score: number;
  matches: { rule: string; excerpt: string }[];
}

const RULES: { rule: string; weight: number; re: RegExp }[] = [
  { rule: "instruction_override", weight: 3, re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|prior|above|all|your|the|any)\b[^.\n]{0,25}\b(instructions?|rules?|polic(y|ies)|prompt|guidelines?|constraints?|restrictions?)/i },
  { rule: "new_instructions", weight: 2, re: /\b(new|updated|real|actual|secret|hidden)\s+(instructions?|rules?|system prompt|directive)s?\b/i },
  { rule: "role_hijack", weight: 3, re: /\b(you are now|from now on,? you|act as (an? )?(admin|administrator|developer|root|system|supervisor)|pretend (to be|you are)|enter (developer|debug|admin|god|maintenance) mode|(developer|debug|admin|god|maintenance) mode (is )?(enabled|on|activated)|\bas (an? )?(admin|administrator|supervisor|nimbus (staff|employee))\b|jailbreak|DAN\b)/i },
  { rule: "fake_authority", weight: 3, re: /(^|\n|\[|<|\()\s*(system|developer|admin(istrator)?|assistant|nimbus (billing|security|admin|staff))\s*(message|notice|override|note|update)?\s*[:\]>)]/i },
  { rule: "preapproval_claim", weight: 2, re: /\b(pre-?approved|already (been )?(approved|authori[sz]ed|verified)|authori[sz]ed by (the )?(manager|admin|supervisor|billing|security)|no (need|reason) to (check|verify|confirm|ask))\b/i },
  { rule: "prompt_extraction", weight: 3, re: /\b(reveal|show|print|repeat|output|display|leak|dump|tell me)\b[^.\n]{0,30}\b(system prompt|your (instructions|prompt|rules|guidelines)|hidden (prompt|instructions)|initial prompt|developer message)/i },
  { rule: "tool_invocation", weight: 3, re: /\b(call|invoke|run|execute|use)\b[^.\n]{0,20}\b(initiate_refund|place_order|upgrade_plan|cancel_order|unlock_account|confirm_pending_action|request_human_escalation|report_outcome|create_replacement_order|reset_password)\b|"?(functionCall|function_call|tool_call)"?\s*[:=]/i },
  { rule: "other_account", weight: 3, re: /\b(another|other|different)\s+(customer|user|account)('s)?\b[^.\n]{0,40}\b(data|orders?|details|transactions?|refund|email|address)|\bcus_[a-z0-9]{3,}\b|\bfor (customer|user|account)\s+(id\s+)?[a-z0-9_@.]{3,}/i },
  { rule: "delimiter_spoof", weight: 3, re: /<\/?\s*(customer_message|system|tool_result|kb_article|instructions?)\s*>|```\s*(system|json)/i },
  { rule: "encoded_payload", weight: 1, re: /\b[A-Za-z0-9+/]{120,}={0,2}(?=\s|$)/ },
];

export function scanForInjection(text: string): InjectionScan {
  const matches: InjectionScan["matches"] = [];
  let score = 0;
  for (const r of RULES) {
    const m = r.re.exec(text);
    if (m) {
      score += r.weight;
      matches.push({ rule: r.rule, excerpt: m[0].slice(0, 80) });
    }
  }
  return { flagged: score >= 3, score, matches };
}

/** Neutralise anything that could close/open our data delimiters inside untrusted text. */
export function neutralise(text: string): string {
  return text.replace(/<\/?\s*(customer_message|system|tool_result|kb_article|untrusted|instructions?)\b[^>]*>/gi, "[removed-tag]");
}

/** Wraps untrusted customer text so the model treats it strictly as data. */
export const asCustomerData = (text: string) => `<customer_message>\n${neutralise(text)}\n</customer_message>`;

/** A per-process canary embedded in the system prompt; if it ever shows up in a reply, the prompt leaked. */
export const PROMPT_CANARY = `NIMBUS-CANARY-${randomBytes(6).toString("hex")}`;

const LEAK_MARKERS = [
  PROMPT_CANARY,
  "CUSTOMER PROFILE:",
  "SECURITY RULES",
  "CONVERSATION MEMORY:",
  "LATEST MESSAGE ANALYSIS",
  "SELECTED WORKFLOW",
  "report_outcome",
  "request_human_escalation",
  "confirm_pending_action",
  "<customer_message>",
];

/** Output guard: blocks replies that echo the system prompt, internal tool names or delimiters. */
export function detectLeak(reply: string): string | null {
  const hit = LEAK_MARKERS.find((m) => reply.includes(m));
  return hit ?? null;
}

const AFFIRMATIVE = /^\s*(yes|yep|yeah|yup|sure|ok(ay)?|confirm(ed)?|go ahead|please do|do it|place it|sounds good|that'?s (right|correct)|correct|proceed)\b[\s\S]{0,60}$/i;

/** Typed confirmations must be short and unambiguous (a long message with "yes" inside is not consent). */
export const isAffirmative = (text: string) => AFFIRMATIVE.test(text.trim()) && !/\b(no|don'?t|cancel|wait|stop|not)\b/i.test(text);
