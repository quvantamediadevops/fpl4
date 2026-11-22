import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PublicPlayer } from "@/types/player";
import { site } from "@/config/site";
import { formatNumber } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { Emblem } from "@/components/layout/Logo";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { RoleBadge } from "@/components/players/RoleBadge";

function SeamRings() {
  return (
    <svg viewBox="0 0 600 600" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
      <circle cx="300" cy="300" r="290" fill="none" stroke="#E5E7EB" />
      <circle cx="300" cy="300" r="220" fill="none" stroke="#F5D98A" strokeOpacity="0.7" />
      <path d="M120 120c80 70 80 290 0 360M480 120c-80 70-80 290 0 360" fill="none" stroke="#C99A28" strokeOpacity="0.35" strokeDasharray="2 9" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function PhotoCollage({ players }: { players: PublicPlayer[] }) {
  const placement = [
    "left-[6%] top-[14%] w-[44%] -rotate-6",
    "right-[6%] top-[6%] w-[46%] rotate-[5deg]",
    "left-1/2 bottom-[4%] w-[48%] -translate-x-1/2 rotate-[-1deg]",
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      <SeamRings />
      {players.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-40 items-center justify-center rounded-full border border-line bg-white shadow-lift">
            <Emblem className="h-24 w-20" />
          </div>
        </div>
      ) : (
        players.slice(0, 3).map((player, i) => (
          <Link
            key={player.id}
            href={`/players/${player.id}`}
            className={`absolute rounded-[20px] border border-line bg-white p-1.5 shadow-lift transition-transform duration-300 hover:z-10 hover:scale-[1.03] ${placement[i]}`}
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-[15px] bg-mist">
              <PlayerPhoto src={player.photo} name={player.name} sizes="240px" priority={i === 0} />
            </div>
            <div className="flex items-center justify-between gap-2 px-1.5 pt-2 pb-1">
              <span className="truncate text-xs font-semibold">{player.name}</span>
              <span className="text-[10px] font-bold text-muted tabular-nums">{formatNumber(player.number)}</span>
            </div>
            <div className="px-1.5 pb-1">
              <RoleBadge role={player.role} />
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

function AvatarStrip({ players, total }: { players: PublicPlayer[]; total: number }) {
  const shown = players.filter((p) => p.photo).slice(0, 5);
  if (total === 0) return null;
  return (
    <Link href="/players" className="mt-7 flex min-h-11 items-center gap-3 lg:hidden">
      {shown.length > 0 && (
        <span className="flex -space-x-2.5">
          {shown.map((p) => (
            <span key={p.id} className="relative size-9 overflow-hidden rounded-full bg-mist ring-2 ring-white">
              <PlayerPhoto src={p.photo} name={p.name} sizes="48px" />
            </span>
          ))}
        </span>
      )}
      <span className="text-sm text-muted">
        <span className="font-bold text-ink tabular-nums">{total}</span> registered players
      </span>
      <ArrowRight className="size-4 text-gold-deep" />
    </Link>
  );
}

export function HeroSection({ players, total }: { players: PublicPlayer[]; total: number }) {
  const featured = players.filter((p) => p.photo);
  return (
    <section className="relative overflow-hidden border-b border-line/70">
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-mist to-transparent" />
      <div className="container-page relative grid items-center gap-10 pt-8 pb-10 sm:pt-14 sm:pb-16 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-24">
        <div>
          <FadeIn>
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-gold-deep shadow-card">
              <span className="size-1.5 rounded-full bg-gold" aria-hidden="true" />
              {site.seasonUpper} · OFFICIAL WEBSITE
            </p>
          </FadeIn>
          <FadeIn delay={0.05}>
            <h1 className="mt-5 text-[40px] leading-[0.98] font-black tracking-[-0.03em] xs:text-[44px] sm:text-6xl lg:text-7xl">
              THE GAME.
              <br />
              <span className="text-gold-deep">THE GLORY.</span>
              <br />
              THE LEAGUE.
            </h1>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h2 className="mt-5 text-base font-semibold tracking-tight sm:text-lg">
              Welcome to {site.name} – {site.season}
            </h2>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted sm:text-base">
              Discover the players, explore the teams and follow the excitement of {site.season}.
            </p>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div className="mt-7 grid gap-2.5 xs:flex xs:flex-wrap">
              <ButtonLink href="/players">
                EXPLORE PLAYERS
                <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/tournament-info" variant="secondary">
                TOURNAMENT INFORMATION
              </ButtonLink>
            </div>
            <AvatarStrip players={players} total={total} />
          </FadeIn>
        </div>
        <FadeIn delay={0.12} y={20} className="hidden lg:block">
          <PhotoCollage players={featured} />
        </FadeIn>
      </div>
    </section>
  );
}
