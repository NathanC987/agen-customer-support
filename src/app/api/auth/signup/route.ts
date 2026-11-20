import { z } from "zod";
import { db, newId, nowIso, run, tx } from "@/lib/db";
import { findUserByEmail, issueSession } from "@/lib/auth/session";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

/** Public sign-up always creates a CUSTOMER. Admin accounts can only be created by seeding / an existing admin. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter your name, a valid email and a password" }, { status: 400 });
  const { name, email, password } = parsed.data;

  if (!rateLimit(`signup:${clientIp(req)}`, 5, 10 * 60_000).ok) return Response.json({ error: "Too many sign-ups — try later" }, { status: 429 });
  const problem = passwordProblem(password);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (findUserByEmail(email)) return Response.json({ error: "An account with that email already exists" }, { status: 409 });

  db();
  const now = nowIso();
  const customerId = newId("cus");
  const user = { id: newId("usr"), name, role: "customer" as const, customer_id: customerId };
  tx(() => {
    run("INSERT INTO customers (id, name, email, phone, tier, location, scenario, created_at) VALUES (?,?,?,?,?,?,?,?)", customerId, name, email, "", "standard", "—", null, now);
    run("INSERT INTO accounts (customer_id, status, failed_login_attempts, last_login_at, two_factor) VALUES (?,?,?,?,?)", customerId, "active", 0, now, 0);
    run(
      "INSERT INTO subscriptions (customer_id, plan, status, sync_status, renews_at) VALUES (?,?,?,?,?)",
      customerId, "free", "active", "ok", new Date(Date.now() + 365 * 86_400_000).toISOString(),
    );
    run("INSERT INTO users (id, email, name, password_hash, role, customer_id, created_at) VALUES (?,?,?,?,?,?,?)", user.id, email, name, hashPassword(password), "customer", customerId, now);
  });
  const token = await issueSession(user);
  return Response.json({ ok: true, role: "customer", name, token });
}
