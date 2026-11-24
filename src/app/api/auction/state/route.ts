import { auctionEnv, fetchSnapshot } from "@/auction/server";

// Public, read-only auction state (no admin data). Screens also receive it live over WebSocket.
export async function GET() {
  const env = auctionEnv();
  if (!env) return Response.json({ error: "Auction is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json(await fetchSnapshot(env), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[auction] state failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Auction state is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
