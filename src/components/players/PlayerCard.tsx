import Link from "next/link";
import type { PublicPlayer } from "@/types/player";
import { formatNumber } from "@/lib/utils";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { RoleBadge } from "@/components/players/RoleBadge";
import { Emblem } from "@/components/layout/Logo";

export const CARD_SIZES = "(min-width: 1280px) 290px, (min-width: 1024px) 31vw, 50vw";

export function PlayerCard({
  player,
  priority = false,
  showNumber = true,
}: {
  player: PublicPlayer;
  priority?: boolean;
  /** The website-generated number badge (#001). Hidden on player profile pages. */
  showNumber?: boolean;
}) {
  return (
    <Link
      href={`/players/${player.id}`}
      aria-label={`${player.name}, ${player.role ?? "role pending"}${showNumber ? `, player ${formatNumber(player.number)}` : ""}`}
      className="group relative block overflow-hidden rounded-2xl bg-mist shadow-card ring-1 ring-line transition-[transform,box-shadow] duration-300 [-webkit-tap-highlight-color:transparent] hover:-translate-y-1 hover:shadow-[0_18px_36px_-18px_rgb(17_24_39/0.45)] active:scale-[0.98] motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[4/5]">
        <PlayerPhoto
          src={player.photo}
          name={player.name}
          sizes={CARD_SIZES}
          priority={priority}
          className="group-hover:scale-[1.04]"
        />

        {/* Legibility scrim: dark only where text sits */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[56%] bg-[linear-gradient(to_top,rgb(17_24_39/0.94)_0%,rgb(17_24_39/0.72)_38%,rgb(17_24_39/0)_100%)]"
        />

        {showNumber && (
          <span className="absolute top-2.5 left-2.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-ink tabular-nums shadow-sm sm:top-3 sm:left-3 sm:text-[11px]">
            {formatNumber(player.number)}
          </span>
        )}
        <Emblem className="absolute top-2.5 right-2.5 h-5 w-[18px] opacity-90 drop-shadow sm:top-3 sm:right-3 sm:h-6 sm:w-[22px]" />

        <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4" aria-hidden="true">
          <RoleBadge role={player.role} tone="solid" />
          <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.2] font-extrabold tracking-tight break-words text-white sm:mt-2 sm:text-[17px]">
            {player.name}
          </p>
        </div>

        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-gold transition-transform duration-300 group-hover:scale-x-100"
        />
      </div>
    </Link>
  );
}
