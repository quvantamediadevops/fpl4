import { site } from "@/config/site";
import { FadeIn } from "@/components/ui/FadeIn";

function Motif() {
  return (
    <svg viewBox="0 0 320 320" aria-hidden="true" className="pointer-events-none absolute -top-16 -right-40 h-[300px] w-[300px] opacity-50 sm:-top-10 sm:-right-10 sm:opacity-100 sm:h-[380px] sm:w-[380px] lg:right-0">
      <circle cx="160" cy="160" r="150" fill="none" stroke="#E5E7EB" />
      <circle cx="160" cy="160" r="112" fill="none" stroke="#D4A72C" strokeOpacity="0.28" />
      <path d="M62 62c55 48 55 148 0 196M258 62c-55 48-55 148 0 196" fill="none" stroke="#D4A72C" strokeOpacity="0.4" strokeDasharray="1 8" strokeLinecap="round" strokeWidth="3" />
      <g stroke="#2563EB" strokeOpacity="0.12" strokeWidth="6" strokeLinecap="round">
        <path d="M140 120v80M160 120v80M180 120v80" />
      </g>
      <path d="M134 110h52" stroke="#D4A72C" strokeOpacity="0.4" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function TeamsHero({ count }: { count: number }) {
  return (
    <header className="relative overflow-hidden border-b border-line/70 bg-gradient-to-b from-mist to-white">
      <Motif />
      <div className="container-page relative flex flex-col gap-6 pt-8 pb-8 sm:flex-row sm:items-end sm:justify-between sm:pt-14 sm:pb-12">
        <FadeIn>
          <p className="inline-flex items-center gap-2 rounded-full border border-champion/35 bg-white px-3 py-1 text-[11px] font-bold tracking-[0.16em] text-gold-deep shadow-card">
            <span className="size-1.5 rounded-full bg-champion" aria-hidden="true" />
            FPL · {site.seasonUpper}
          </p>
          <h1 className="mt-4 text-[34px] leading-[0.95] font-black tracking-[-0.03em] text-navy xs:text-[40px] sm:text-6xl">
            MEET THE <span className="text-champion">TEAMS</span>
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted sm:text-base">
            Eight teams. One championship. One ultimate winner.
          </p>
        </FadeIn>
        <FadeIn delay={0.1} className="shrink-0">
          <div
            className="inline-flex items-center gap-3 rounded-2xl bg-navy py-3 pr-5 pl-3 text-white shadow-[0_14px_30px_-16px_rgb(17_24_39/0.8)] ring-1 ring-champion/40 sm:gap-4 sm:py-4 sm:pr-7 sm:pl-4"
            role="status"
            aria-label={`${count} teams`}
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-champion text-[22px] font-black text-navy tabular-nums sm:size-16 sm:text-3xl">
              {String(count).padStart(2, "0")}
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-black tracking-[0.08em] sm:text-xl">TEAMS</span>
              <span className="block text-[11px] font-semibold tracking-[0.12em] text-white/60">{site.seasonUpper}</span>
            </span>
          </div>
        </FadeIn>
      </div>
    </header>
  );
}
