import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

/**
 * Edge of the app: verifies the session JWT before any page or API route runs.
 * Route handlers and server actions re-check authorization themselves (defence in depth) —
 * this layer only keeps unauthenticated users out and sends each role to its own area.
 */
const ADMIN_PAGES = ["/tickets", "/dashboard", "/knowledge", "/inventory"];
const CUSTOMER_PAGES = ["/chat"];
const PUBLIC_PAGES = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const bearer = req.headers.get("authorization");
  const token = bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  const home = session?.role === "admin" ? "/dashboard" : "/chat";

  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth/")) return NextResponse.next();
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    return NextResponse.next();
  }

  if (PUBLIC_PAGES.some((p) => pathname.startsWith(p))) {
    return session ? NextResponse.redirect(new URL(home, req.url)) : NextResponse.next();
  }
  if (!session) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete(SESSION_COOKIE); // expired / tampered token
    return res;
  }
  if (pathname === "/") return NextResponse.redirect(new URL(home, req.url));
  if (ADMIN_PAGES.some((p) => pathname.startsWith(p)) && session.role !== "admin") return NextResponse.redirect(new URL("/chat", req.url));
  if (CUSTOMER_PAGES.some((p) => pathname.startsWith(p)) && session.role !== "customer") return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
