import type { PublicPlayer } from "@/types/player";
import { site } from "@/config/site";
import { tournament } from "@/config/tournament";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { RoleBadge } from "@/components/players/RoleBadge";
import { BackButton } from "@/components/players/BackButton";
import { Emblem } from "@/components/layout/Logo";
import { FadeIn } from "@/components/ui/FadeIn";

export function PlayerProfile({ player }: { player: PublicPlayer }) {
  return (
    <article className="container-page pt-5 sm:pt-8">
      <BackButton />

      <div className="mt-5 grid gap-6 sm:mt-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center md:gap-10 lg:gap-16">
        <FadeIn y={16}>
          <div className="relative mx-auto max-w-md rounded-[28px] border border-line bg-white p-2 shadow-lift md:max-w-none">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-mist">
              <PlayerPhoto src={player.photo} name={player.name} sizes="(min-width: 768px) 45vw, 100vw" priority />
            </div>
            <div className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-white py-1.5 pr-4 pl-2 shadow-card">
              <Emblem className="h-6 w-5" />
              <span className="text-[10px] font-extrabold tracking-[0.12em] whitespace-nowrap">
                FPL · {site.seasonUpper}
              </span>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.08} className="pt-4 md:pt-0">
          <p className="text-[11px] font-bold tracking-[0.16em] text-gold-deep uppercase">
            Registered player · {site.season}
          </p>
          <h1 className="mt-3 text-[32px] leading-[1.05] font-extrabold tracking-tight break-words text-balance sm:text-5xl">
            {player.name}
          </h1>
          <RoleBadge role={player.role} size="md" className="mt-4" />

          <div className="mt-8 flex items-center gap-4 rounded-2xl border border-line bg-white px-4 py-4 shadow-card sm:px-5">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-ink">
              <Emblem className="h-8 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] leading-snug font-extrabold tracking-tight break-words">{site.name}</p>
              <p className="mt-0.5 text-sm text-muted">
                {site.season} · {tournament.year}
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </article>
  );
}
