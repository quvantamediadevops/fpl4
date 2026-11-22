import type { Metadata } from "next";
import { Shield } from "lucide-react";
import { site } from "@/config/site";
import { teams } from "@/config/tournament";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { TeamsHero } from "@/components/teams/TeamsHero";
import { TeamGrid } from "@/components/teams/TeamGrid";

export const metadata: Metadata = {
  title: "Teams",
  description: `Meet the ${teams.length} teams of ${site.name} – ${site.season}, with team owners and icon players.`,
};

export default function TeamsPage() {
  const sorted = [...teams].sort((a, b) => a.number - b.number);
  return (
    <>
      <TeamsHero count={sorted.length} />
      <section className="container-page pt-6 sm:pt-10" aria-label="Teams">
        {sorted.length > 0 ? (
          <TeamGrid teams={sorted} />
        ) : (
          <EmptyState
            icon={Shield}
            title="Teams will be announced soon"
            description="Team names, owners and icon players will be published here once they are officially confirmed."
            action={<ButtonLink href="/players" variant="secondary">MEET THE PLAYERS</ButtonLink>}
          />
        )}
      </section>
    </>
  );
}
