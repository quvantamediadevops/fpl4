import { CalendarDays, MapPin, Shield } from "lucide-react";
import { tournament, teamCount } from "@/config/tournament";
import { eventStatus, formatDate } from "@/lib/tournament";
import { FadeIn } from "@/components/ui/FadeIn";
import { Emblem } from "@/components/layout/Logo";

function Motif() {
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true" className="pointer-events-none absolute -top-16 -right-40 h-[300px] w-[300px] opacity-50 sm:-top-8 sm:-right-10 sm:h-[380px] sm:w-[380px] sm:opacity-100">
      <circle cx="160" cy="160" r="150" fill="none" stroke="#E2E8F0" />
      <circle cx="160" cy="160" r="112" fill="none" stroke="#D4A72C" strokeOpacity="0.28" />
      <path d="M62 62c55 48 55 148 0 196M258 62c-55 48-55 148 0 196" fill="none" stroke="#D4A72C" strokeOpacity="0.4" strokeDasharray="1 8" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export function InfoHero({ now }: { now: Date }) {
  const start = eventStatus(tournament.matchStart, now);
  const facts = [
    { icon: CalendarDays, label: "Matches start", value: formatDate(tournament.matchStart) },
    { icon: MapPin, label: "Venue", value: tournament.venue.ground },
    { icon: Shield, label: "Format", value: `${teamCount} teams` },
  ];
  return (
    <header className="relative overflow-hidden border-b border-line/70 bg-gradient-to-b from-mist to-white">
      <Motif />
      <div className="container-page relative pt-8 pb-8 sm:pt-14 sm:pb-12">
        <FadeIn>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-white px-3 py-1 text-[11px] font-bold tracking-[0.16em] text-gold-deep shadow-card">
              <Emblem className="h-4 w-3.5" />
              FPL · {tournament.season} · {tournament.year}
            </p>
            {start.tone === "upcoming" && (
              <p className="text-xs font-semibold text-muted">
                Matches begin <span className="text-ink">{start.label.toLowerCase()}</span>
              </p>
            )}
          </div>
          <p className="mt-5 text-[12px] font-extrabold tracking-[0.14em] text-ink/70 sm:text-[13px]">{tournament.name}</p>
          <h1 className="mt-2 max-w-3xl text-[34px] leading-[0.98] font-black tracking-[-0.03em] text-ink xs:text-[40px] sm:text-6xl">
            THE ROAD TO THE <span className="text-gold">CHAMPIONSHIP</span>
          </h1>
        </FadeIn>
        <FadeIn delay={0.08}>
          <dl className="mt-7 grid gap-2.5 sm:mt-9 sm:grid-cols-3 sm:gap-3">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-card">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-gold">
                  <Icon className="size-[18px]" strokeWidth={2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold tracking-[0.12em] text-muted uppercase">{label}</dt>
                  <dd className="text-[15px] leading-snug font-bold text-ink">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </FadeIn>
      </div>
    </header>
  );
}
