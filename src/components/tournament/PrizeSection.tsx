import { Medal, Trophy } from "lucide-react";
import { tournament } from "@/config/tournament";
import { formatINR } from "@/lib/tournament";
import { SectionHeading } from "@/components/tournament/SectionHeading";

export function PrizeSection() {
  const { winner, runnerUp } = tournament.prizes;
  return (
    <section aria-labelledby="prize-title">
      <SectionHeading id="prize-title" eyebrow="Prize money" title="Play for the trophy" />
      <div className="grid gap-3 sm:grid-cols-[1.25fr_1fr] sm:gap-4">
        <div className="relative overflow-hidden rounded-[20px] bg-ink p-5 text-white shadow-[0_20px_40px_-24px_rgb(17_24_39/0.8)] ring-1 ring-gold/40 sm:p-7">
          <svg viewBox="0 0 200 200" aria-hidden="true" className="absolute -right-10 -bottom-12 h-48 w-48 text-gold/[0.07] sm:h-60 sm:w-60">
            <path fill="currentColor" d="M50 20h100v18h30v20c0 26-18 44-42 48-6 18-18 28-30 31v23h28v20H64v-20h28v-23c-12-3-24-13-30-31-24-4-42-22-42-48V38h30V20Zm0 34H36v4c0 14 8 25 18 30-3-10-4-21-4-34Zm100 0c0 13-1 24-4 34 10-5 18-16 18-30v-4h-14Z" />
          </svg>
          <span className="inline-flex items-center gap-2 rounded-full bg-gold px-3 py-1 text-[11px] font-black tracking-[0.14em] text-ink">
            <Trophy className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
            WINNER
          </span>
          <p className="relative mt-4 text-[44px] leading-none font-black tracking-tight text-gold tabular-nums sm:text-6xl">{formatINR(winner)}</p>
          <p className="relative mt-2 text-sm text-white/60">Champions of {tournament.season.toLowerCase().replace("season", "Season")}</p>
        </div>
        <div className="relative overflow-hidden rounded-[20px] border border-line bg-white p-5 shadow-card sm:p-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1 text-[11px] font-black tracking-[0.14em] text-ink ring-1 ring-line">
            <Medal className="size-3.5 text-[#94a3b8]" strokeWidth={2.5} aria-hidden="true" />
            RUNNER-UP
          </span>
          <p className="mt-4 text-[38px] leading-none font-black tracking-tight text-ink tabular-nums sm:text-5xl">{formatINR(runnerUp)}</p>
          <p className="mt-2 text-sm text-muted">Second place</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Prize amounts as announced on the official {tournament.season.toLowerCase().replace("season", "Season")} poster.</p>
    </section>
  );
}
