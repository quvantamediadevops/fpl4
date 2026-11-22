import { ArrowRight, CalendarDays, Gavel, Medal, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { tournament } from "@/config/tournament";
import { formatDate, formatINR, formatTime } from "@/lib/tournament";
import { Eyebrow } from "@/components/ui/PageHeader";

function Tile({ icon: Icon, label, value, sub, dark }: { icon: LucideIcon; label: string; value: string; sub?: string; dark?: boolean }) {
  return (
    <div className={dark ? "rounded-2xl bg-ink p-4 text-white ring-1 ring-gold/40 sm:p-5" : "rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5"}>
      <p className={`flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase ${dark ? "text-white/60" : "text-muted"}`}>
        <Icon className={`size-3.5 ${dark ? "text-gold" : "text-gold-deep"}`} strokeWidth={2.25} aria-hidden="true" />
        {label}
      </p>
      <p className={`mt-2 text-xl leading-tight font-black tracking-tight tabular-nums sm:text-2xl ${dark ? "text-gold" : "text-ink"}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${dark ? "text-white/60" : "text-muted"}`}>{sub}</p>}
    </div>
  );
}

export function TournamentHighlights() {
  const t = tournament;
  return (
    <section className="container-page mt-12 sm:mt-16" aria-labelledby="highlights-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>{t.season} at a glance</Eyebrow>
          <h2 id="highlights-heading" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            THE ROAD TO THE CHAMPIONSHIP
          </h2>
        </div>
        <Link
          href="/tournament-info"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-5 text-[11px] font-bold tracking-[0.08em] ring-1 ring-line transition hover:bg-mist active:scale-[0.97]"
        >
          TOURNAMENT INFO
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <Tile icon={CalendarDays} label="Matches start" value={formatDate(t.matchStart, "short")} sub={t.venue.ground} />
        <Tile icon={Gavel} label="Auction" value={formatDate(t.auction.date, "short")} sub={formatTime(t.auction.time)} />
        <Tile icon={Trophy} label="Winner" value={formatINR(t.prizes.winner)} dark />
        <Tile icon={Medal} label="Runner-up" value={formatINR(t.prizes.runnerUp)} />
      </div>
    </section>
  );
}
