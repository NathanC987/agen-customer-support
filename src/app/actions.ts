"use server";

import { refresh } from "next/cache";
import { submitCsat as recordCsat } from "@/lib/agents/satisfaction";
import { assignTicket as assign, replyToTicket as reply, transitionTicket } from "@/lib/agents/tracking";
import { draftArticleFromConversation } from "@/lib/agents/kb-expansion";
import { LlmUnavailableError } from "@/lib/llm/gemini";
import { publishKb } from "@/lib/db/repo";
import { seed } from "@/lib/db/seed";
import type { TicketStatus } from "@/lib/types";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export async function submitCsat(conversationId: string, rating: number, comment: string | null): Promise<Result> {
  try {
    recordCsat(conversationId, rating, comment);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTicketStatus(ticketId: number, status: TicketStatus, actor = "Support Lead"): Promise<Result> {
  try {
    transitionTicket(ticketId, status, actor);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function assignTicket(ticketId: number, assignee: string): Promise<Result> {
  try {
    assign(ticketId, assignee, "Support Lead");
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function replyToTicket(ticketId: number, agentName: string, text: string, awaitCustomer: boolean): Promise<Result> {
  if (!text.trim()) return { ok: false, error: "Reply is empty" };
  try {
    reply(ticketId, agentName, text.trim(), awaitCustomer);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function generateKbArticle(conversationId: string): Promise<Result> {
  try {
    const id = await draftArticleFromConversation(conversationId);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof LlmUnavailableError) return { ok: false, error: e.reason === "no_key" ? "Add GEMINI_API_KEY to generate articles" : "Gemini is rate-limited — try again shortly" };
    return fail(e);
  }
}

export async function publishArticle(id: string): Promise<Result> {
  publishKb(id);
  refresh();
  return { ok: true };
}

export async function resetDemo(): Promise<Result> {
  try {
    seed();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
