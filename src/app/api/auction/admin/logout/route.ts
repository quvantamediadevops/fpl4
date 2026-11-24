import { logout, sameOrigin } from "@/auction/auth";
import { auctionEnv } from "@/auction/server";

export async function POST(request: Request) {
  const env = auctionEnv();
  if (!env) return Response.json({ message: "Auction is not configured." }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ message: "Request blocked: wrong origin." }, { status: 403 });
  await logout(env);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
