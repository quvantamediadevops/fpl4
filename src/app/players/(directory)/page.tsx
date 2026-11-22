import type { Metadata } from "next";
import { site } from "@/config/site";
import { getPlayerDirectory, toPublicPlayer } from "@/lib/players";
import { DataUnavailable } from "@/components/ui/DataUnavailable";
import { PlayerDirectory } from "@/components/players/PlayerDirectory";
import { PlayerStatsBar } from "@/components/players/PlayerStatsBar";
import { PlayersHeader } from "@/components/players/PlayersHeader";

export const metadata: Metadata = {
  title: "Players",
  description: `Explore the officially registered players of ${site.name} – ${site.season}. Search by name and filter batsmen, bowlers and all rounders.`,
  openGraph: { url: "/players", title: `Players | ${site.name} – ${site.season}` },
};

export default async function PlayersPage() {
  const directory = await getPlayerDirectory();

  return (
    <>
      <PlayersHeader>{directory.ok && <PlayerStatsBar stats={directory.data.stats} />}</PlayersHeader>
      <section aria-label="Player directory" className="container-page pt-2 sm:pt-3">
        {directory.ok ? (
          <PlayerDirectory
            players={directory.data.players.map(toPublicPlayer)}
            stats={directory.data.stats}
            pageSize={site.playersPerPage}
          />
        ) : (
          <DataUnavailable reason={directory.reason} />
        )}
      </section>
    </>
  );
}
