import { permanentRedirect } from "next/navigation";

/** Team Squads Live moved under /auction; keep old links and bookmarks working. */
export default function TeamSquadsRedirectPage(): never {
  permanentRedirect("/auction/team-squads");
}
