import { getRequestUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  return Response.json(user);
}
