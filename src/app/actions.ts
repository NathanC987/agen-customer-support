"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { submitCsat as recordCsat } from "@/lib/agents/satisfaction";
import { assignTicket as assign, replyToTicket as reply, transitionTicket } from "@/lib/agents/tracking";
import { draftArticleFromConversation } from "@/lib/agents/kb-expansion";
import { LlmUnavailableError } from "@/lib/llm/gemini";
import { getConversation, publishKb } from "@/lib/db/repo";
import { seed } from "@/lib/db/seed";
import { AuthError, requireActionUser } from "@/lib/auth/session";
import { createProduct, moveStock } from "@/lib/commerce";
import { indexArticle, indexProduct, rebuildIndex } from "@/lib/rag";
import type { TicketStatus } from "@/lib/types";

/**
 * Server actions are public HTTP endpoints — each one re-checks the caller's session and role here,
 * never trusting the UI that rendered the button.
 */
type Result = { ok: true; id?: string; note?: string } | { ok: false; error: string };

const fail = (e: unknown): Result => ({ ok: false, error: e instanceof AuthError || e instanceof Error ? e.message : String(e) });

export async function submitCsat(conversationId: string, rating: number, comment: string | null): Promise<Result> {
  try {
    const user = await requireActionUser("customer");
    const conv = getConversation(conversationId);
    if (!conv || conv.customer_id !== user.customerId) return { ok: false, error: "Conversation not found" };
    recordCsat(conversationId, rating, comment?.slice(0, 1000) ?? null);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTicketStatus(ticketId: number, status: TicketStatus): Promise<Result> {
  try {
    const admin = await requireActionUser("admin");
    transitionTicket(ticketId, status, admin.name);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function assignTicket(ticketId: number, assignee: string): Promise<Result> {
  try {
    const admin = await requireActionUser("admin");
    assign(ticketId, assignee, admin.name);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The reply is always signed with the signed-in admin's name (the client can't choose who it speaks as). */
export async function replyToTicket(ticketId: number, _agentName: string, text: string, awaitCustomer: boolean): Promise<Result> {
  if (!text.trim()) return { ok: false, error: "Reply is empty" };
  try {
    const admin = await requireActionUser("admin");
    reply(ticketId, admin.name, text.trim().slice(0, 4000), awaitCustomer);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function generateKbArticle(conversationId: string): Promise<Result> {
  try {
    await requireActionUser("admin");
    const id = await draftArticleFromConversation(conversationId);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof LlmUnavailableError) return { ok: false, error: e.reason === "no_key" ? "Add GEMINI_API_KEY to generate articles" : "Gemini is rate-limited — try again shortly" };
    return fail(e);
  }
}

export async function publishArticle(id: string): Promise<Result> {
  try {
    await requireActionUser("admin");
    publishKb(id);
    // keep the vector index in sync; the article is live in SQL even if indexing fails
    const note = await indexArticle(id).then(
      () => "Indexed in the vector DB",
      (e) => `Published, but vector indexing failed: ${e instanceof Error ? e.message : e}`,
    );
    refresh();
    return { ok: true, note };
  } catch (e) {
    return fail(e);
  }
}

export async function resetDemo(): Promise<Result> {
  try {
    await requireActionUser("admin");
    seed();
    const note = await rebuildIndex().then(
      () => "Vector index rebuilt",
      () => "Vector index not rebuilt (is Qdrant running?)",
    );
    refresh();
    return { ok: true, note };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- inventory (admin) ---------------- */

export async function adjustStock(sku: string, delta: number): Promise<Result> {
  try {
    const admin = await requireActionUser("admin");
    const d = Math.trunc(delta);
    if (!d || Math.abs(d) > 1000) return { ok: false, error: "Invalid stock change" };
    moveStock(sku, d, d > 0 ? "manual restock" : "manual adjustment", `admin:${admin.name}`);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const NewProduct = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, "SKU: 3–30 letters, digits or dashes"),
  name: z.string().trim().min(3).max(100),
  price: z.coerce.number().positive().max(100000),
  category: z.string().trim().toLowerCase().min(2).max(40),
  stock: z.coerce.number().int().min(0).max(100000),
  description: z.string().trim().min(10).max(600),
});

export async function addProduct(input: unknown): Promise<Result> {
  try {
    const admin = await requireActionUser("admin");
    const parsed = NewProduct.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product" };
    const p = createProduct(parsed.data, `admin:${admin.name}`);
    const note = await indexProduct(p.sku).then(
      () => "Indexed for semantic search",
      () => "Saved — vector indexing failed (customers can still find it by keyword)",
    );
    refresh();
    return { ok: true, id: p.sku, note };
  } catch (e) {
    return fail(e);
  }
}
