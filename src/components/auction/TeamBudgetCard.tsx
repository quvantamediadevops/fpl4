"use client";

import { Crown } from "lucide-react";
import type { AuctionTeamView } from "@/auction/types";
import { cn } from "@/lib/utils";
import { TONE_BAR, TONE_TEXT, TeamLogo, budgetTone, inr, roleText } from "./bits";

export function TeamBudgetCard({ team, playersPerTeam, compact = false }: { team: AuctionTeamView; playersPerTeam: number; compact?: boolean }) {
  const tone = budgetTone(team);
  const spentPct = Math.min(100, (team.spent / team.initialBudget) * 100);
  return (
    <article className="flex flex-col rounded-2xl border border-white/10 bg-[#0b1222]/80 p-4 text-white shadow-[0_20px_50px_-30px_rgb(0_0_0/0.9)]" aria-label={`${team.name} budget`}>
      <header className="flex items-center gap-3">
        <TeamLogo team={team} className="size-11 text-base" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-black tracking-wide">{team.name}</h3>
          <p className="truncate text-[11px] font-semibold tracking-wide text-white/45">OWNER {team.owner}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-lg font-black tabular-nums", TONE_TEXT[tone])}>{inr(team.remaining)}</p>
          <p className="text-[10px] font-bold tracking-[0.18em] text-white/40">LEFT</p>
        </div>
      </header>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={team.initialBudget} aria-valuenow={team.spent} aria-label="Budget spent">
        <div className={cn("h-full rounded-full transition-[width] duration-500", TONE_BAR[tone])} style={{ width: `${spentPct}%` }} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="BUDGET" value={inr(team.initialBudget)} />
        <Stat label="SPENT" value={inr(team.spent)} />
        <Stat label="MAX NEXT" value={team.slotsLeft ? inr(team.maxNextPrice) : "—"} />
        <Stat label="AUCTION" value={`${team.purchased} / ${playersPerTeam}`} />
        <Stat label="SLOTS LEFT" value={String(team.slotsLeft)} />
        <Stat label="SQUAD" value={`${team.purchased + (team.icon ? 1 : 0)} / ${playersPerTeam + 1}`} />
      </dl>

      {team.icon && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-gold/10 px-2.5 py-1.5 text-xs font-bold text-gold-light">
          <Crown className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="tracking-[0.16em]">ICON</span>
          <span className="truncate text-white">{team.icon.name}</span>
          <span className="ml-auto text-[10px] tracking-wider text-gold-light/70">PRE-ASSIGNED</span>
        </p>
      )}

      {!compact && (
        <ol className="mt-3 space-y-1 text-sm">
          {team.players.length === 0 && <li className="text-xs text-white/35">No auction purchases yet.</li>}
          {team.players.map((p, i) => (
            <li key={p.playerId} className="flex items-center gap-2">
              <span className="w-5 text-right text-[11px] tabular-nums text-white/35">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold uppercase">{p.name}</span>
              <span className="hidden text-[10px] font-bold tracking-wider text-gold-light/60 sm:inline">{roleText(p.role)}</span>
              <span className="w-16 text-right font-bold tabular-nums">{inr(p.price)}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-1.5 py-1.5">
      <dt className="text-[9px] font-bold tracking-[0.16em] text-white/40">{label}</dt>
      <dd className="mt-0.5 text-sm font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
