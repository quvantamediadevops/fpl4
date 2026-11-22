"use client";

import { m } from "motion/react";
import { Crown, Star, type LucideIcon } from "lucide-react";
import type { Team } from "@/types/tournament";
import { TeamCrest } from "@/components/teams/TeamCrest";

export const teamCardVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

function Role({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: "gold" | "blue" }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-muted uppercase">
        <Icon
          className={tone === "gold" ? "size-3.5 text-champion" : "size-3.5 text-bat"}
          strokeWidth={2.25}
          fill={tone === "gold" ? "currentColor" : "none"}
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="mt-1 text-[14px] leading-snug font-bold tracking-tight break-words text-navy sm:text-[15px]">{value}</dd>
    </div>
  );
}

function TeamNo({ n, className }: { n: number; className?: string }) {
  return (
    <span aria-hidden="true" className={className}>
      {String(n).padStart(2, "0")}
    </span>
  );
}

export function TeamCard({ team }: { team: Team }) {
  return (
    <m.article
      variants={teamCardVariants}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      aria-labelledby={`team-${team.slug}`}
      className="group relative flex h-full overflow-hidden rounded-[20px] border border-line bg-white shadow-card transition-[box-shadow,border-color] duration-300 hover:border-champion/40 hover:shadow-[0_22px_40px_-22px_rgb(17_24_39/0.45)] sm:flex-col"
    >
      {/* Crest panel: left tile on mobile, top band from sm up */}
      <div className="relative flex w-[104px] shrink-0 items-center justify-center overflow-hidden bg-navy sm:h-[148px] sm:w-auto">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgb(212_167_44/0.22),transparent_60%),repeating-linear-gradient(135deg,rgb(255_255_255/0.035)_0_2px,transparent_2px_14px)]"
        />
        <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 hidden h-1/2 w-full sm:block" aria-hidden="true">
          <path d="M0 100 C60 40 140 40 200 100" fill="none" stroke="#D4A72C" strokeOpacity="0.25" strokeDasharray="1 5" strokeLinecap="round" strokeWidth="2" />
        </svg>
        <TeamNo
          n={team.number}
          className="absolute top-2 right-3 hidden text-[56px] leading-none font-black tracking-tighter text-transparent [-webkit-text-stroke:1px_rgb(212_167_44/0.35)] sm:block"
        />
        <TeamCrest
          team={team}
          className="w-[60px] [container-type:inline-size] transition-transform duration-300 group-hover:scale-[1.06] sm:w-[84px]"
        />
        <span aria-hidden="true" className="absolute inset-y-0 right-0 w-[3px] bg-champion sm:inset-x-0 sm:top-auto sm:bottom-0 sm:h-[3px] sm:w-auto" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <p className="text-[10px] font-bold tracking-[0.18em] text-gold-deep tabular-nums">
          TEAM <TeamNo n={team.number} />
          <span className="sr-only">{team.number}</span>
        </p>
        <h2
          id={`team-${team.slug}`}
          className="mt-1 text-[17px] leading-tight font-black tracking-tight break-words text-navy uppercase sm:text-xl"
        >
          {team.name}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:mt-auto sm:pt-4">
          <Role icon={Crown} label="Owner" value={team.owner} tone="gold" />
          <Role icon={Star} label="Icon" value={team.icon} tone="blue" />
        </dl>
      </div>
    </m.article>
  );
}
