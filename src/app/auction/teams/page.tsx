import { permanentRedirect } from "next/navigation";

/** The public team overview is now the Team Squads Live screen; keep old links working. */
export default function AuctionTeamsPage(): never {
  permanentRedirect("/auction/team-squads");
}
