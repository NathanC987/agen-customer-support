import { SignJWT, jwtVerify } from "jose";

/** Session JWT (HS256). Safe to import from proxy.ts — no database access here. */
export type Role = "customer" | "admin";

export interface SessionClaims {
  sub: string; // user id
  role: Role;
  name: string;
  cid: string | null; // linked customer id (customers only)
}

export const SESSION_COOKIE = "nimbus_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ISSUER = "nimbus-support";
const AUDIENCE = "nimbus-support-web";

let warned = false;
function secret(): Uint8Array {
  let s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be set (32+ chars) in production");
    if (!warned) {
      console.warn("[auth] JWT_SECRET missing or short — using an insecure development secret. Set JWT_SECRET in .env.local.");
      warned = true;
    }
    s = "dev-only-insecure-secret-change-me-please-0123456789";
  }
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, name: claims.name, cid: claims.cid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || (role !== "customer" && role !== "admin")) return null;
    return { sub: payload.sub, role, name: String(payload.name ?? ""), cid: typeof payload.cid === "string" ? payload.cid : null };
  } catch {
    return null;
  }
}

/** Reads the token from `Authorization: Bearer …` first, then the session cookie. */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return m ? decodeURIComponent(m.slice(SESSION_COOKIE.length + 1)) : null;
}
