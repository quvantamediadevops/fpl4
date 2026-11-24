import { getAdminSession } from "@/auction/auth";
import { auctionEnv, fetchAdminDetail } from "@/auction/server";

export async function GET() {
  const env = auctionEnv();
  if (!env) return Response.json({ message: "Auction is not configured." }, { status: 503 });
  if (!(await getAdminSession(env))) return Response.json({ message: "Sign in required." }, { status: 401 });
  return Response.json(await fetchAdminDetail(env), { headers: { "Cache-Control": "no-store" } });
}
