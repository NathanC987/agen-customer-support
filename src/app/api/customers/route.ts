import { connection } from "next/server";
import { listCustomers } from "@/lib/db/repo";
import { requireApiUser } from "@/lib/auth/session";

/** Admin only: the customer directory. */
export async function GET(req: Request) {
  await connection();
  const auth = await requireApiUser(req, "admin");
  if (auth.error) return auth.error;
  return Response.json(listCustomers());
}
