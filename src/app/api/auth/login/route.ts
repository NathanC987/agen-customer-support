import { z } from "zod";
import { findUserByEmail, issueSession, logSecurityEvent } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

const DUMMY_HASH = hashPassword("timing-equaliser-not-a-real-password-1");

const Body = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email and password" }, { status: 400 });
  const { email, password } = parsed.data;

  const limit = rateLimit(`login:${clientIp(req)}:${email.toLowerCase()}`, 5, 60_000);
  if (!limit.ok) {
    logSecurityEvent({ type: "login_rate_limited", severity: "medium", detail: { email } });
    return Response.json({ error: `Too many attempts — try again in ${limit.retryAfterS}s` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });
  }

  const user = findUserByEmail(email);
  // verify against a dummy hash when the user doesn't exist, so timing doesn't reveal which emails are registered
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    logSecurityEvent({ type: "login_failed", severity: "low", detail: { email } });
    return Response.json({ error: "Incorrect email or password" }, { status: 401 });
  }
  const token = await issueSession(user);
  return Response.json({ ok: true, role: user.role, name: user.name, token });
}
