import type { ReactNode } from "react";
import { site } from "@/config/site";

function Motif() {
  return (
    <svg
      viewBox="0 0 240 240"
      aria-hidden="true"
      className="pointer-events-none absolute -top-12 -right-24 h-[240px] w-[240px] opacity-60 sm:-top-6 sm:-right-6 sm:h-[280px] sm:w-[280px] sm:opacity-100"
    >
      <circle cx="120" cy="120" r="110" fill="none" stroke="#E2E8F0" />
      <path d="M48 48c40 36 40 108 0 144M192 48c-40 36-40 108 0 144" fill="none" stroke="#D4A72C" strokeOpacity="0.45" strokeDasharray="1 7" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

export function PlayersHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative overflow-hidden bg-gradient-to-b from-mist to-white">
      <Motif />
      <div className="container-page relative pt-7 pb-5 sm:pt-12 sm:pb-8">
        <p className="flex items-center gap-2.5 text-[11px] font-bold tracking-[0.16em] text-gold-deep uppercase">
          <span className="h-[2px] w-7 rounded-full bg-gold" aria-hidden="true" />
          {site.name} · {site.season}
        </p>
        <h1 className="mt-3 text-[32px] leading-[0.98] font-black tracking-[-0.03em] text-ink xs:text-[36px] sm:mt-4 sm:text-5xl lg:text-[56px]">
          MEET THE PLAYERS
        </h1>
        <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted sm:mt-3 sm:text-base">
          Explore the officially registered players of {site.name} – {site.season}.
        </p>
        {children && <div className="mt-5 sm:mt-7">{children}</div>}
      </div>
    </header>
  );
}
