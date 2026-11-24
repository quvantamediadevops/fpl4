"use client";

import { m } from "motion/react";
import { Trophy } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { AuctionSnapshot } from "@/auction/types";
import { TONE_TEXT, TeamLogo, budgetTone, inr, roleText } from "@/components/auction/bits";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { cn } from "@/lib/utils";
import type { PlayerRole } from "@/types/player";
import { BroadcastShell } from "./BroadcastShell";
import { AnimatedInr, EASE, useSquadChanges } from "./live-motion";

const ROLES: { role: PlayerRole; label: string; bar: string }[] = [
  { role: "BATSMAN", label: "BATSMEN", bar: "bg-sky-400" },
  { role: "BOWLER", label: "BOWLERS", bar: "bg-emerald-400" },
  { role: "ALL ROUNDER", label: "ALL-ROUNDERS", bar: "bg-violet-400" },
];
const PAD = "px-[clamp(1rem,2.2vw,3rem)]";

export function SummaryScreen() {
  return (
    <BroadcastShell eyebrow="FPL SEASON 4" title="Auction summary">
      {(s) => <SummaryBody s={s} />}
    </BroadcastShell>
  );
}

function SummaryBody({ s }: { s: AuctionSnapshot }) {
  const changes = useSquadChanges(s);
  const teams = useMemo(() => new Map(s.teams.map((t) => [t.id, t])), [s.teams]);
  // Active sales only (corrected/undone sales are not part of any squad).
  const sold = useMemo(() => s.players.filter((p) => p.status === "SOLD" && p.teamId && p.price != null), [s.players]);
  const top = useMemo(() => [...sold].sort((a, b) => (b.price ?? 0) - (a.price ?? 0) || a.order - b.order).slice(0, 5), [sold]);
  const average = sold.length ? Math.round(s.counts.spent / sold.length) : 0;
  const byRole = ROLES.map((r) => {
    const list = sold.filter((p) => p.role === r.role);
    return { ...r, count: list.length, spent: list.reduce((a, p) => a + (p.price ?? 0), 0) };
  });
  const maxSpent = Math.max(1, ...s.teams.map((t) => t.spent));
  const final = s.status === "COMPLETED";

  return (
    <main className={cn("relative z-10 flex flex-none flex-col gap-[clamp(0.6rem,1.2vh,1.1rem)] pt-[clamp(0.6rem,1.2vh,1rem)] pb-[clamp(0.75rem,1.8vh,1.5rem)] fit:min-h-0 fit:flex-1", PAD)}>
      {final && (
        <p className="self-start rounded-full border border-gold/60 bg-gold/15 px-4 py-1 text-[clamp(0.62rem,0.72vw,0.85rem)] font-extrabold tracking-[0.3em] text-gold-light">FINAL RESULTS · AUCTION COMPLETE</p>
      )}
      <dl className="grid grid-cols-2 gap-[clamp(0.5rem,0.8vw,1rem)] sm:grid-cols-3 fit:grid-cols-5">
        <Kpi label="PLAYERS SOLD" value={`${s.counts.sold}`} sub={`OF ${s.counts.pool} IN THE POOL`} />
        <Kpi label="TOTAL SPENT" value={<AnimatedInr value={s.counts.spent} />} sub={`${inr(s.counts.combinedRemaining)} STILL TO SPEND`} accent="text-gold-light" />
        <Kpi label="AVERAGE PRICE" value={<AnimatedInr value={average} />} sub="PER PLAYER SOLD" />
        <Kpi label="UNSOLD" value={`${s.counts.unsold}`} sub={`${s.counts.available} STILL AVAILABLE`} accent="text-red-300" />
        <Kpi label="SQUAD SLOTS FILLED" value={`${s.counts.filledSlots}/${s.counts.totalSlots}`} sub={`PLUS ${s.teams.length} PRE-ASSIGNED ICONS`} accent="text-emerald-300" />
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-[clamp(0.6rem,0.9vw,1.1rem)] fit:min-h-0 fit:flex-1 fit:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col gap-[clamp(0.6rem,1.2vh,1.1rem)] fit:min-h-0">
          <section className="bc-panel flex flex-col p-[clamp(0.8rem,1.1vw,1.3rem)] fit:min-h-0 fit:flex-1" aria-label="Top buys">
            <h2 className="bc-eyebrow flex items-center gap-2">
              <Trophy className="size-[1.2em]" aria-hidden="true" /> TOP BUYS
            </h2>
            {top.length === 0 ? (
              <p className="mt-4 text-sm text-white/40">No players sold yet.</p>
            ) : (
              <ol className="mt-[clamp(0.5rem,1vh,0.8rem)] grid grid-cols-[minmax(0,1fr)] gap-[clamp(0.3rem,0.6vh,0.5rem)] fit:min-h-0 fit:flex-1 fit:auto-rows-fr">
                {top.map((p, i) => {
                  const t = teams.get(p.teamId ?? "");
                  return (
                    <m.li
                      key={p.id}
                      layout="position"
                      transition={{ duration: 0.5, ease: EASE }}
                      className={cn("flex min-h-0 min-w-0 items-center gap-3 rounded-xl px-[clamp(0.5rem,0.7vw,0.85rem)] py-[clamp(0.25rem,0.6vh,0.5rem)]", i === 0 ? "bg-gold/[0.12] ring-1 ring-gold/40" : "bg-white/[0.035]")}
                    >
                      <span className={cn("w-[1.4em] text-center font-display text-[clamp(1.1rem,1.5vw,1.8rem)] font-extrabold", i === 0 ? "text-gold-light" : "text-white/35")}>{i + 1}</span>
                      <span className="relative aspect-square h-[clamp(2.2rem,5vh,3.4rem)] shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                        <PlayerPhoto src={p.photo} name={p.name} sizes="64px" stage />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate font-display text-[clamp(1rem,1.3vw,1.55rem)] font-bold uppercase">{p.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[clamp(0.55rem,0.62vw,0.75rem)] font-bold tracking-[0.12em] text-white/50">
                          {t && <TeamLogo team={t} className="size-[1.3em] text-[6px]" />}
                          {t?.name} · {roleText(p.role)}
                        </span>
                      </span>
                      <span className="font-display text-[clamp(1.2rem,1.6vw,1.9rem)] font-extrabold text-gold-light tabular-nums">{inr(p.price ?? 0)}</span>
                    </m.li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="bc-panel shrink-0 p-[clamp(0.8rem,1.1vw,1.3rem)]" aria-label="Spend by category">
            <h2 className="bc-eyebrow">SPEND BY CATEGORY</h2>
            <ul className="mt-[clamp(0.5rem,1vh,0.75rem)] grid grid-cols-3 gap-[clamp(0.4rem,0.6vw,0.75rem)]">
              {byRole.map((r) => (
                <li key={r.role} className="rounded-xl bg-white/[0.04] px-3 py-[clamp(0.4rem,0.8vh,0.6rem)]">
                  <p className="text-[clamp(0.5rem,0.56vw,0.68rem)] font-extrabold tracking-[0.18em] text-white/45">{r.label}</p>
                  <p className="font-display text-[clamp(1.2rem,1.6vw,1.9rem)] leading-tight font-extrabold tabular-nums">{inr(r.spent)}</p>
                  <p className="text-[clamp(0.55rem,0.6vw,0.72rem)] font-bold text-white/55 tabular-nums">{r.count} SOLD</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <m.div className={cn("h-full rounded-full", r.bar)} initial={false} animate={{ width: `${s.counts.spent ? (r.spent / s.counts.spent) * 100 : 0}%` }} transition={{ duration: 0.8, ease: EASE }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="bc-panel flex flex-col p-[clamp(0.8rem,1.1vw,1.3rem)] fit:min-h-0" aria-label="Franchise spending">
          <h2 className="bc-eyebrow">FRANCHISE SPENDING</h2>
          <div className="mt-[clamp(0.4rem,0.8vh,0.6rem)] grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-[clamp(0.6rem,1vw,1.25rem)] border-b border-white/10 pb-1.5 text-[clamp(0.48rem,0.54vw,0.66rem)] font-extrabold tracking-[0.2em] text-white/40 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto_auto_auto]">
            <span>FRANCHISE</span>
            <span className="hidden sm:block">BUDGET USED</span>
            <span className="text-right">SPENT</span>
            <span className="text-right">LEFT</span>
            <span className="text-right">BOUGHT</span>
          </div>
          <ul className="grid fit:min-h-0 fit:flex-1 fit:grid-rows-8">
            {s.teams.map((t) => {
              const mark = changes.teams.get(t.id);
              return (
                <li
                  key={t.id}
                  className="relative grid min-h-[2.75rem] grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto_auto_auto] gap-x-[clamp(0.6rem,1vw,1.25rem)] border-b border-white/[0.06]"
                >
                  {mark && (
                    <m.span
                      key={changes.version}
                      className={cn("pointer-events-none absolute -inset-x-2 inset-y-0.5 rounded-lg", mark === "loss" ? "bg-red-500/15" : "bg-gold/15")}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 2.6, ease: "easeOut" }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex min-w-0 items-center gap-2.5">
                    <TeamLogo team={t} className="size-[clamp(1.8rem,3.8vh,2.6rem)] text-[9px]" />
                    <span className="truncate font-display text-[clamp(0.95rem,1.2vw,1.45rem)] font-bold">{t.name}</span>
                  </span>
                  <span className="hidden h-2 overflow-hidden rounded-full bg-white/10 sm:block" aria-hidden="true">
                    <m.span
                      className="block h-full rounded-full bg-[linear-gradient(90deg,#a87916,#d4a72c_60%,#f5d98a)]"
                      initial={false}
                      animate={{ width: `${(t.spent / maxSpent) * 100}%` }}
                      transition={{ duration: 0.8, ease: EASE }}
                    />
                  </span>
                  <span className="text-right font-display text-[clamp(1rem,1.3vw,1.55rem)] font-extrabold text-gold-light tabular-nums">
                    <AnimatedInr value={t.spent} />
                  </span>
                  <span className={cn("text-right font-display text-[clamp(1rem,1.3vw,1.55rem)] font-extrabold tabular-nums", TONE_TEXT[budgetTone(t)])}>
                    <AnimatedInr value={t.remaining} />
                  </span>
                  <span className="text-right font-display text-[clamp(1rem,1.3vw,1.55rem)] font-extrabold tabular-nums">
                    {t.purchased}
                    <span className="text-white/40">/{s.rules.playersPerTeam}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: ReactNode; sub: string; accent?: string }) {
  return (
    <div className="bc-panel px-[clamp(0.8rem,1vw,1.25rem)] py-[clamp(0.55rem,1.2vh,1rem)]">
      <dt className="text-[clamp(0.52rem,0.6vw,0.72rem)] font-extrabold tracking-[0.22em] text-white/45">{label}</dt>
      <dd className={cn("mt-1 font-display text-[clamp(1.8rem,2.8vw,3.4rem)] leading-none font-extrabold tabular-nums", accent)}>{value}</dd>
      <p className="mt-1 text-[clamp(0.5rem,0.56vw,0.68rem)] font-bold tracking-[0.16em] text-white/40">{sub}</p>
    </div>
  );
}
