import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get, newId, nowIso, run } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, tokenFromRequest, verifySession, type Role } from "./jwt";

/**
 * Data-access layer for authentication. Every server entry point (page, route handler, server action)
 * resolves the caller here — identity always comes from the verified JWT, never from request bodies.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  customerId: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  customer_id: string | null;
}

export const findUserByEmail = (email: string) => get<UserRow>("SELECT * FROM users WHERE email = ?", email.trim());

/** Verifies the token AND that the user still exists with the same role (so deleted users / role changes take effect). */
async function userFromToken(token: string | null | undefined): Promise<SessionUser | null> {
  const claims = await verifySession(token);
  if (!claims) return null;
  const row = get<UserRow>("SELECT * FROM users WHERE id = ?", claims.sub);
  if (!row || row.role !== claims.role || row.customer_id !== claims.cid) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, customerId: row.customer_id };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function getRequestUser(req: Request): Promise<SessionUser | null> {
  return userFromToken(tokenFromRequest(req));
}

/* ---------- pages ---------- */

export async function requirePageUser(role?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect(user.role === "admin" ? "/dashboard" : "/chat");
  return user;
}

/* ---------- route handlers ---------- */

export type ApiAuth = { user: SessionUser; error?: undefined } | { user?: undefined; error: Response };

export async function requireApiUser(req: Request, role?: Role): Promise<ApiAuth> {
  const user = await getRequestUser(req);
  if (!user) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) };
  if (role && user.role !== role) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

/** Customers may only touch their own customer record; admins may touch any. */
export const canAccessCustomer = (user: SessionUser, customerId: string) => user.role === "admin" || user.customerId === customerId;

/* ---------- server actions ---------- */

export class AuthError extends Error {}

export async function requireActionUser(role?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("You need to sign in");
  if (role && user.role !== role) throw new AuthError("You are not allowed to do that");
  return user;
}

/* ---------- issuing sessions ---------- */

export async function issueSession(user: { id: string; name: string; role: Role; customer_id: string | null }) {
  const token = await signSession({ sub: user.id, role: user.role, name: user.name, cid: user.customer_id });
  run("UPDATE users SET last_login_at = ? WHERE id = ?", nowIso(), user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/* ---------- security audit log ---------- */

export function logSecurityEvent(e: { type: string; customer_id?: string | null; conversation_id?: string | null; severity: "low" | "medium" | "high"; detail: unknown }) {
  run(
    "INSERT INTO security_events (id, type, customer_id, conversation_id, severity, detail, created_at) VALUES (?,?,?,?,?,?,?)",
    newId("sec"), e.type, e.customer_id ?? null, e.conversation_id ?? null, e.severity, JSON.stringify(e.detail), nowIso(),
  );
}
