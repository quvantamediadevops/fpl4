import { ArrowRight } from "lucide-react";
import { teamCount } from "@/config/tournament";
import { getPlayerDirectory, toPublicPlayer } from "@/lib/players";
import { HeroSection } from "@/components/home/HeroSection";
import { TournamentStats } from "@/components/home/TournamentStats";
import { TournamentHighlights } from "@/components/home/TournamentHighlights";
import { PlayerGrid } from "@/components/players/PlayerGrid";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/PageHeader";
import { DataUnavailable } from "@/components/ui/DataUnavailable";

export default async function HomePage() {
  const directory = await getPlayerDirectory();
  const players = directory.ok ? directory.data.players.map(toPublicPlayer) : [];

  return (
    <>
      <HeroSection players={players} total={players.length} />
      <TournamentStats stats={directory.ok ? directory.data.stats : null} teamCount={teamCount} />
      <TournamentHighlights />

      <section className="container-page mt-14 sm:mt-20" aria-labelledby="players-heading">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Registered players</Eyebrow>
            <h2 id="players-heading" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              MEET THE PLAYERS
            </h2>
          </div>
          {players.length > 0 && (
            <ButtonLink href="/players" variant="secondary" className="min-h-11 px-5 text-[11px]">
              VIEW ALL {players.length}
              <ArrowRight className="size-4" />
            </ButtonLink>
          )}
        </div>
        {!directory.ok ? (
          <DataUnavailable reason={directory.reason} />
        ) : players.length > 0 ? (
          <PlayerGrid players={players.slice(0, 8)} animate={false} />
        ) : (
          <p className="rounded-2xl border border-line bg-mist px-5 py-8 text-center text-sm text-muted">
            Registered players will appear here automatically.
          </p>
        )}
      </section>
    </>
  );
}
