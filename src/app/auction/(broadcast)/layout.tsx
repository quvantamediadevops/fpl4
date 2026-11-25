import { Barlow_Condensed } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { auctionEnv, fetchSnapshot } from "@/auction/server";
import { auctionDevNotice } from "@/components/auction/AuctionDevNotice";
import { AuctionUnavailable } from "@/components/auction/AuctionUnavailable";
import { LiveProvider } from "@/components/broadcast/LiveProvider";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--font-display-face" });

/**
 * Public broadcast screens (player presentation, team squads, summary).
 * One live connection is shared by all three, so switching screens (keys 1/2/3)
 * is instant, keeps fullscreen and never reconnects.
 */
export default async function BroadcastLayout({ children }: { children: ReactNode }) {
  await connection(); // always rendered per request: live data
  const devNotice = auctionDevNotice("/auction/player-presentation");
  if (devNotice) return devNotice;
  const env = auctionEnv();
  if (!env) return <AuctionUnavailable title="Auction not connected" detail="The auction database is not configured for this site yet." />;
  // First paint with real data; the live channel takes over in the browser (and retries if this fails).
  const initial = await fetchSnapshot(env).catch(() => null);
  return (
    <div className={display.variable}>
      <LiveProvider initial={initial}>{children}</LiveProvider>
    </div>
  );
}
