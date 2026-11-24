import type { Metadata } from "next";
import { connection } from "next/server";
import { auctionEnv, fetchSnapshot } from "@/auction/server";
import { auctionDevNotice } from "@/components/auction/AuctionDevNotice";
import { AuctionUnavailable } from "@/components/auction/AuctionUnavailable";
import { TeamsOverview } from "@/components/auction/TeamsOverview";

export const metadata: Metadata = { title: "Auction Teams", robots: { index: false, follow: false } };

export default async function AuctionTeamsPage() {
  await connection(); // always rendered per request: live data and the admin session
  const devNotice = auctionDevNotice("/auction/teams");
  if (devNotice) return devNotice;
  const env = auctionEnv();
  if (!env) return <AuctionUnavailable title="Auction not connected" detail="The auction database is not configured for this site yet." />;
  const initial = await fetchSnapshot(env).catch(() => null);
  if (!initial) return <AuctionUnavailable title="Auction temporarily unavailable" detail="Reload in a moment." />;
  return <TeamsOverview initial={initial} />;
}
