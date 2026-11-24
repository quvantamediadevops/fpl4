import { permanentRedirect } from "next/navigation";

/** The live presenter moved to the broadcast screens; keep old links and bookmarks working. */
export default function AuctionPresenterPage(): never {
  permanentRedirect("/player-presentation");
}
