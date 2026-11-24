import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { adminLoginConfigured, getAdminSession, isSuperAdmin } from "@/auction/auth";
import { resetEnvironment, type ResetInfo } from "@/auction/reset";
import { auctionEnv, fetchResetInfo, fetchSnapshot } from "@/auction/server";
import { AdminLogin } from "@/components/auction/AdminLogin";
import { auctionDevNotice } from "@/components/auction/AuctionDevNotice";
import { AuctionUnavailable } from "@/components/auction/AuctionUnavailable";
import { ControlRoom } from "@/components/auction/ControlRoom";

export const metadata: Metadata = {
  title: "Auction Control Room",
  robots: { index: false, follow: false },
};

export default async function AuctionAdminPage() {
  await connection(); // always rendered per request: live data and the admin session
  const devNotice = auctionDevNotice("/auction/admin");
  if (devNotice) return devNotice;
  const env = auctionEnv();
  if (!env) return <AuctionUnavailable title="Auction database not connected" detail="The AUCTION_DB and AUCTION_ROOM bindings are missing." />;

  const session = await getAdminSession(env).catch(() => null);
  if (!session) return <AdminLogin configured={adminLoginConfigured()} />;

  let snapshot;
  try {
    snapshot = await fetchSnapshot(env);
  } catch {
    return <AuctionUnavailable title="Auction server unavailable" detail="Reload in a moment. No changes were lost: every sale is stored in the database." />;
  }

  // Danger Zone data only for super-admins; everyone else never receives it.
  let danger: ResetInfo | null = null;
  if (isSuperAdmin(session.adminId)) {
    const host = (await headers()).get("host") ?? "";
    danger = await fetchResetInfo(env, resetEnvironment(`https://${host}/`)).catch(() => null);
  }

  return (
    <>
      {/* The CSRF token for this session; sent back as a header on every action. */}
      <meta name="auction-csrf" content={session.csrfToken} />
      <ControlRoom initial={snapshot} adminId={session.adminId} csrf={session.csrfToken} danger={danger} />
    </>
  );
}
