import { permanentRedirect } from "next/navigation";

/** The auction summary moved under /auction; keep old links and bookmarks working. */
export default function AuctionSummaryRedirectPage(): never {
  permanentRedirect("/auction/auction-summary");
}
