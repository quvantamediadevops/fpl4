"use client";

import { AnimatePresence, m } from "motion/react";
import { Crown } from "lucide-react";
import type { AuctionSnapshot, AuctionTeamView } from "@/auction/types";
import { IconPhoto, TONE_TEXT, TeamLogo, budgetTone, inr } from "@/components/auction/bits";
import { cn } from "@/lib/utils";
import type { PlayerRole } from "@/types/player";
import { BroadcastShell } from "./BroadcastShell";
import { AnimatedInr, EASE, useSquadChanges, type Changes } from "./live-motion";

const ROLE: Record<PlayerRole, { label: string; cls: string }> = {
  BATSMAN: { label: "Batsman", cls: "bg-sky-400/12 text-sky-200 ring-sky-300/25" },
  BOWLER: { label: "Bowler", cls: "bg-emerald-400/12 text-emerald-200 ring-emerald-300/25" },
  "ALL ROUNDER": { label: "All-Rounder", cls: "bg-violet-400/14 text-violet-200 ring-violet-300/25" },
};

export function SquadsScreen() {
  return (
    <BroadcastShell eyebrow="ALL EIGHT FRANCHISES" title="Team squads live" sub={(s) => <SquadsLine s={s} />}>
      {(s) => <SquadsBody s={s} />}
    </BroadcastShell>
  );
}

function SquadsBody({ s }: { s: AuctionSnapshot }) {
  const changes = useSquadChanges(s);
  return (
    <>
      <main className="relative z-10 grid flex-none grid-cols-1 gap-[clamp(0.6rem,0.8vw,1rem)] px-[clamp(1rem,2.2vw,3rem)] pt-[clamp(0.5rem,1vh,0.9rem)] pb-[clamp(0.75rem,1.8vh,1.5rem)] sm:grid-cols-2 fit:min-h-0 fit:flex-1 fit:grid-cols-4 fit:grid-rows-2">
        {s.teams.map((t, i) => (
          <TeamPanel key={t.id} team={t} index={i} playersPerTeam={s.rules.playersPerTeam} changes={changes} />
        ))}
      </main>
    </>
  );
}

function SquadsLine({ s }: { s: AuctionSnapshot }) {
  return (
    <p className="text-[clamp(0.62rem,0.7vw,0.85rem)] font-bold tracking-[0.2em] text-white/55">
      <b className="text-white">{s.counts.sold}</b> / {s.counts.pool} PLAYERS SOLD · <b className="text-gold-light">{inr(s.counts.spent)}</b> SPENT · SLOTS{" "}
      <b className="text-white">{s.counts.filledSlots}</b> / {s.counts.totalSlots} · ICONS PRE-ASSIGNED AT ₹0
    </p>
  );
}

function TeamPanel({ team, index, playersPerTeam, changes }: { team: AuctionTeamView; index: number; playersPerTeam: number; changes: Changes }) {
  const tone = budgetTone(team);
  const mark = changes.teams.get(team.id);
  const spentPct = Math.min(100, (team.spent / team.initialBudget) * 100);
  const open = Math.max(0, playersPerTeam - team.players.length);

  return (
    <m.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.05 * index }}
      className="bc-panel flex flex-col overflow-hidden p-[clamp(0.7rem,0.85vw,1.1rem)] fit:min-h-0"
      aria-label={`${team.name} squad`}
    >
      {/* gold hairline on top, like a broadcast lower-third */}
      <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" aria-hidden="true" />
      {mark && (
        <m.span
          key={changes.version}
          className={cn("pointer-events-none absolute inset-0 z-10 rounded-2xl ring-2", mark === "loss" ? "ring-red-400/80" : "ring-gold shadow-[0_0_40px_-6px_rgb(212_167_44/0.6)]")}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2.8, ease: "easeOut" }}
          aria-hidden="true"
        />
      )}

      <header className="flex items-center gap-[clamp(0.5rem,0.6vw,0.8rem)]">
        <TeamLogo team={team} className="size-[clamp(2.2rem,4.6vh,3.3rem)] text-xs ring-2 ring-gold/40" />
        <div className="min-w-0 flex-1 leading-none">
          <h2 className="truncate font-display text-[clamp(1rem,1.2vw,1.5rem)] font-extrabold tracking-[0.01em]">{team.name}</h2>
          <p className="mt-1 truncate text-[clamp(0.5rem,0.56vw,0.68rem)] font-bold tracking-[0.16em] text-white/45">OWNER · {team.owner}</p>
        </div>
        <div className="shrink-0 text-right leading-none">
          <p className={cn("font-display text-[clamp(1.3rem,1.75vw,2.15rem)] font-extrabold tabular-nums", TONE_TEXT[tone])}>
            <AnimatedInr value={team.remaining} />
          </p>
          <p className="mt-1 text-[clamp(0.48rem,0.52vw,0.64rem)] font-extrabold tracking-[0.18em] text-white/45">BUDGET LEFT</p>
        </div>
      </header>

      <div className="mt-[clamp(0.4rem,0.8vh,0.7rem)] flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gold/25 bg-gold/[0.07] px-2 py-[clamp(0.2rem,0.45vh,0.4rem)]">
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-gold px-1.5 py-0.5 text-[clamp(0.48rem,0.52vw,0.64rem)] font-black tracking-[0.16em] text-[#111827]">
            <Crown className="size-[1.1em]" aria-hidden="true" /> ICON
          </span>
          <IconPhoto teamId={team.id} name={team.icon?.name} className="size-[clamp(1.25rem,2.3vh,1.65rem)]" />
          <span className="min-w-0 truncate font-display text-[clamp(0.9rem,1.02vw,1.25rem)] font-bold uppercase">{team.icon?.name ?? "—"}</span>
          <span className="ml-auto shrink-0 text-[clamp(0.48rem,0.52vw,0.64rem)] font-bold tracking-[0.12em] text-gold-light/70">₹0</span>
        </span>
        <span className="shrink-0 text-right leading-none">
          <span className="block font-display text-[clamp(1rem,1.2vw,1.45rem)] font-extrabold tabular-nums">
            {team.purchased}
            <span className="text-white/40">/{playersPerTeam}</span>
          </span>
          <span className="mt-0.5 block text-[clamp(0.46rem,0.5vw,0.6rem)] font-extrabold tracking-[0.14em] text-white/45">{team.slotsLeft} SLOTS LEFT</span>
        </span>
      </div>

      <div className="mt-[clamp(0.35rem,0.7vh,0.6rem)] flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Budget used" aria-valuemin={0} aria-valuemax={team.initialBudget} aria-valuenow={team.spent}>
          <m.div className="h-full rounded-full bg-[linear-gradient(90deg,#a87916,#d4a72c_60%,#f5d98a)]" initial={false} animate={{ width: `${spentPct}%` }} transition={{ duration: 0.8, ease: EASE }} />
        </div>
        <span className="shrink-0 text-[clamp(0.48rem,0.54vw,0.66rem)] font-extrabold tracking-[0.12em] text-white/55 tabular-nums">
          <AnimatedInr value={team.spent} /> SPENT
        </span>
      </div>

      {/* The list sizes its rows from its own height (container units), so 11 rows never overlap at any resolution. */}
      <div className="mt-[clamp(0.35rem,0.7vh,0.6rem)] flex min-h-0 flex-1 flex-col fit:[container-type:size]">
        {team.players.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-white/10 py-6 text-center">
            <p className="text-[clamp(0.62rem,0.7vw,0.85rem)] font-bold tracking-[0.22em] text-white/45">
              NO AUCTION PURCHASES YET
              <span className="mt-1 block text-white/30">{playersPerTeam} SLOTS OPEN</span>
            </p>
          </div>
        ) : (
          <ol className="grid flex-1 auto-rows-[2rem] text-[0.95rem] fit:h-full fit:auto-rows-auto fit:grid-rows-[repeat(var(--slots),minmax(0,1fr))] fit:text-[clamp(0.7rem,5.9cqh,1.3rem)]" style={{ ["--slots" as string]: playersPerTeam }}>
            <AnimatePresence initial={false}>
              {team.players.map((p, i) => {
                const pm = changes.players.get(p.playerId);
                const role = p.role ? ROLE[p.role] : null;
                return (
                  <m.li
                    key={p.playerId}
                    layout="position"
                    initial={{ opacity: 0, x: -12, backgroundColor: "rgba(212,167,44,0.38)" }}
                    animate={{ opacity: 1, x: 0, backgroundColor: "rgba(212,167,44,0)" }}
                    exit={{ opacity: 0, x: 16, backgroundColor: "rgba(239,68,68,0.25)", transition: { duration: 0.45 } }}
                    transition={{ duration: 0.45, ease: EASE, backgroundColor: { duration: 2.6 } }}
                    className="grid min-h-0 grid-cols-[1.3em_minmax(0,1fr)_auto_3.7em] items-center gap-x-[0.45em] rounded-md border-b border-white/[0.05] px-0.5 leading-none"
                  >
                    <span className="text-[0.62em] font-bold text-white/35 tabular-nums">{i + 1}</span>
                    <span className="flex min-w-0 items-center gap-[0.4em]">
                      <span className="truncate font-display font-bold uppercase">{p.name}</span>
                      {pm === "corrected" && <span className="shrink-0 rounded bg-amber-400/20 px-[0.3em] py-[0.1em] text-[0.5em] font-black tracking-[0.12em] text-amber-200 ring-1 ring-amber-300/40">CORRECTED</span>}
                    </span>
                    <span className={cn("rounded px-[0.45em] py-[0.15em] text-[0.58em] font-bold whitespace-nowrap ring-1", role?.cls ?? "bg-white/5 text-white/50 ring-white/10")}>{role?.label ?? "—"}</span>
                    <span className="text-right font-display font-extrabold text-gold-light tabular-nums">{inr(p.price)}</span>
                  </m.li>
                );
              })}
            </AnimatePresence>
            {Array.from({ length: open }, (_, i) => (
              <li key={`open-${i}`} className="hidden min-h-0 grid-cols-[1.3em_minmax(0,1fr)] items-center gap-x-[0.45em] border-b border-dashed border-white/[0.04] px-0.5 leading-none fit:grid" aria-hidden="true">
                <span className="text-[0.62em] font-bold text-white/15 tabular-nums">{team.players.length + i + 1}</span>
                <span className="text-[0.55em] font-bold tracking-[0.2em] text-white/15">OPEN SLOT</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </m.article>
  );
}
