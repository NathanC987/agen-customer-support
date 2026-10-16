import { connection } from "next/server";
import { listCustomers } from "@/lib/db/repo";

export async function GET() {
  await connection();
  return Response.json(listCustomers().filter((c) => c.scenario));
}
