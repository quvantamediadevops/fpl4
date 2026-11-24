"use client";

import type { AuctionSnapshot } from "@/auction/types";
import { Emblem } from "@/components/layout/Logo";
import { ConnectionPill, StatusPill, inr } from "./bits";
import { TeamBudgetCard } from "./TeamBudgetCard";
import { useAuctionLive } from "./useAuctionLive";

export function TeamsOverview({ initial }: { initial: AuctionSnapshot }) {
  const { snapshot, connection } = useAuctionLive(initial);
  const s = snapshot ?? initial;
  return (
    <div data-standalone className="min-h-dvh bg-[#060a14] text-white">
      <header className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-5 lg:px-6">
        <Emblem className="h-11 w-10" />
        <div className="leading-tight">
          <p className="text-[11px] font-extrabold tracking-[0.18em] text-white/70">FPL SEASON 4 AUCTION</p>
          <h1 className="text-xl font-black tracking-[0.14em] text-gold-light">TEAM SQUADS</h1>
        </div>
        <StatusPill status={s.status} />
        <ConnectionPill connection={connection} />
        <p className="ml-auto text-sm text-white/60">
          {s.counts.sold} / {s.counts.pool} sold · {inr(s.counts.spent)} spent
        </p>
      </header>
      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 pb-10 sm:grid-cols-2 lg:px-6 xl:grid-cols-4">
        {s.teams.map((t) => (
          <TeamBudgetCard key={t.id} team={t} playersPerTeam={s.rules.playersPerTeam} />
        ))}
      </main>
    </div>
  );
}
