import type { Metadata } from "next";
import { connection } from "next/server";
import { auctionEnv, fetchSnapshot } from "@/auction/server";
import { auctionDevNotice } from "@/components/auction/AuctionDevNotice";
import { AuctionUnavailable } from "@/components/auction/AuctionUnavailable";
import { Presenter } from "@/components/auction/Presenter";

export const metadata: Metadata = { title: "Auction Live", robots: { index: false, follow: false } };

export default async function AuctionPresenterPage() {
  await connection(); // always rendered per request: live data and the admin session
  const devNotice = auctionDevNotice("/auction/presenter");
  if (devNotice) return devNotice;
  const env = auctionEnv();
  if (!env) return <AuctionUnavailable title="Auction not connected" detail="The auction database is not configured for this site yet." />;
  // First paint with real data; the live channel takes over in the browser (and retries if this fails).
  const initial = await fetchSnapshot(env).catch(() => null);
  return <Presenter initial={initial} />;
}
