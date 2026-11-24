import { getAdminSession } from "@/auction/auth";
import { auctionCsv } from "@/auction/report";
import { auctionEnv, fetchAdminDetail, fetchSnapshot } from "@/auction/server";

export async function GET() {
  const env = auctionEnv();
  if (!env) return new Response("Auction is not configured.", { status: 503 });
  if (!(await getAdminSession(env))) return new Response("Sign in required.", { status: 401 });
  const [snapshot, detail] = await Promise.all([fetchSnapshot(env), fetchAdminDetail(env)]);
  const suffix = snapshot.status === "COMPLETED" ? "final" : "provisional";
  return new Response(auctionCsv(snapshot, detail), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fpl-s4-auction-${suffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
