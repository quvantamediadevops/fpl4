import { CalendarDays, Clock, MapPin } from "lucide-react";
import type { Fixture, MatchStatus } from "@/types/tournament";
import { cn } from "@/lib/utils";

const statusStyle: Record<MatchStatus, string> = {
  SCHEDULED: "bg-mist text-muted ring-line",
  LIVE: "bg-red-50 text-red-700 ring-red-200",
  COMPLETED: "bg-bowl/8 text-bowl-deep ring-bowl/25",
  POSTPONED: "bg-gold-light/30 text-gold-deep ring-gold/30",
  CANCELLED: "bg-mist text-muted ring-line line-through",
};

export function formatMatchDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function MatchCard({ fixture }: { fixture: Fixture }) {
  return (
    <article className="rounded-[18px] border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold tracking-[0.14em] text-gold-deep">MATCH {fixture.matchNumber}</p>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-[0.08em] ring-1 ring-inset", statusStyle[fixture.status])}>
          {fixture.status}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <p className="text-[15px] font-bold break-words">{fixture.teamA}</p>
        <span className="rounded-full bg-mist px-2.5 py-1 text-[11px] font-bold text-muted ring-1 ring-line">VS</span>
        <p className="text-right text-[15px] font-bold break-words">{fixture.teamB}</p>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[13px] text-muted">
        <li className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {formatMatchDate(fixture.date)}
        </li>
        {fixture.time && (
          <li className="flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden="true" />
            {fixture.time}
          </li>
        )}
        {fixture.venue && (
          <li className="flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden="true" />
            {fixture.venue}
          </li>
        )}
      </ul>
    </article>
  );
}
