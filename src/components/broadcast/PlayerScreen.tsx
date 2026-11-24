"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Crown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuctionEventView, AuctionPlayerView, AuctionSnapshot, AuctionTeamView } from "@/auction/types";
import { IconPhoto, TONE_BAR, TONE_TEXT, TeamLogo, budgetTone, inr, roleText } from "@/components/auction/bits";
import { Emblem } from "@/components/layout/Logo";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { useFitText } from "@/components/presentation/useFitText";
import { cn } from "@/lib/utils";
import { BroadcastShell } from "./BroadcastShell";
import { AnimatedInr, EASE, useSquadChanges, type Changes } from "./live-motion";

/** Events announced full-screen: sales, unsold, and corrections of either. */
const OVERLAY_EVENTS = new Set<AuctionEventView["type"]>(["PLAYER_SOLD", "PLAYER_UNSOLD", "SALE_CORRECTED", "SALE_REVERSED"]);
const OVERLAY_MS = 7000;
const PAD = "px-[clamp(1rem,2.2vw,3rem)]";

function phase(s: AuctionSnapshot, current: AuctionPlayerView | null) {
  if (s.status === "NOT_STARTED") return "PRE-AUCTION";
  if (s.status === "COMPLETED") return "AUCTION COMPLETE";
  if (s.status === "PAUSED") return "AUCTION PAUSED";
  if (current && current.unsoldCount > 0 && current.status !== "SOLD") return "UNSOLD ROUND";
  return "LIVE BIDDING";
}

export function PlayerScreen() {
  return (
    <BroadcastShell eyebrow="LIVE AUCTION" title="Player presentation" backdrop="stadium" sub={(s) => <PhaseLine s={s} />}>
      {(s) => <PlayerScreenBody s={s} />}
    </BroadcastShell>
  );
}

function PlayerScreenBody({ s }: { s: AuctionSnapshot }) {
  const players = useMemo(() => new Map(s.players.map((p) => [p.id, p])), [s.players]);
  const teams = useMemo(() => new Map(s.teams.map((t) => [t.id, t])), [s.teams]);
  const current = s.currentPlayerId ? players.get(s.currentPlayerId) ?? null : null;
  const changes = useSquadChanges(s);

  // Announce only events that happen while this screen is open: never on load or when switching screens.
  const [seenEventId] = useState(() => s.lastEvent?.id ?? 0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const event = s.lastEvent;
  const overlay = event && event.id > seenEventId && event.id !== dismissed && OVERLAY_EVENTS.has(event.type) ? event : null;
  useEffect(() => {
    if (!overlay) return;
    const t = setTimeout(() => setDismissed(overlay.id), OVERLAY_MS);
    return () => clearTimeout(t);
  }, [overlay]);

  return (
    <>
      <main
        className={cn(
          "relative z-10 grid flex-none grid-cols-[minmax(0,1fr)] gap-[clamp(0.75rem,1.4vw,1.75rem)] py-[clamp(0.6rem,1.4vh,1.25rem)] fit:min-h-0 fit:flex-1 fit:grid-cols-[minmax(0,1fr)_minmax(21rem,27%)]",
          PAD,
        )}
      >
        <Stage s={s} current={current} teams={teams} />
        <aside className="flex flex-col gap-[clamp(0.6rem,1.2vh,1rem)] fit:min-h-0">
          <RecentPurchases s={s} players={players} teams={teams} />
          <IconPlayers s={s} />
        </aside>
      </main>

      <BudgetStrip s={s} changes={changes} />

      <AnimatePresence>
        {overlay && <ResultOverlay key={overlay.id} event={overlay} player={players.get(overlay.playerId ?? "")} team={teams.get(overlay.teamId ?? "")} />}
      </AnimatePresence>
    </>
  );
}

function PhaseLine({ s }: { s: AuctionSnapshot }) {
  const current = s.currentPlayerId ? s.players.find((p) => p.id === s.currentPlayerId) ?? null : null;
  return (
    <>
      <span className="rounded-full border border-gold/40 bg-[#1a1405]/85 px-3 py-1 text-[clamp(0.6rem,0.7vw,0.82rem)] font-extrabold tracking-[0.26em] text-gold-light">{phase(s, current)}</span>
      <span className="text-[clamp(0.62rem,0.72vw,0.85rem)] font-bold tracking-[0.2em] text-white/55">
        <b className="text-white">{s.counts.sold}</b> / {s.counts.pool} SOLD · <b className="text-emerald-300">{s.counts.available}</b> AVAILABLE · <b className="text-red-300">{s.counts.unsold}</b> UNSOLD
      </span>
    </>
  );
}

function Stage({ s, current, teams }: { s: AuctionSnapshot; current: AuctionPlayerView | null; teams: Map<string, AuctionTeamView> }) {
  const reduce = useReducedMotion();
  if (!current) {
    const text = s.status === "COMPLETED" ? "AUCTION COMPLETE" : s.status === "NOT_STARTED" ? "AUCTION STARTS SHORTLY" : s.status === "PAUSED" ? "AUCTION PAUSED" : "NEXT PLAYER COMING UP";
    return (
      <section className="grid min-h-[40vh] place-items-center" aria-live="polite">
        <div className="text-center">
          <Emblem className="mx-auto h-[clamp(6rem,16vh,10rem)] w-[clamp(5.4rem,14.4vh,9rem)] drop-shadow-[0_0_40px_rgb(212_167_44/0.55)]" />
          <p className="mt-6 font-display text-[clamp(2rem,4vw,4.75rem)] leading-none font-extrabold tracking-[0.06em]">{text}</p>
          <p className="mt-3 text-[clamp(0.7rem,0.85vw,1rem)] font-bold tracking-[0.4em] text-gold-light">
            {s.counts.sold} OF {s.counts.pool} PLAYERS SOLD
          </p>
        </div>
      </section>
    );
  }
  const team = current.teamId ? teams.get(current.teamId) : undefined;
  return (
    <section className="relative flex flex-col items-center gap-[clamp(1rem,2.4vw,3rem)] fit:min-h-0 fit:flex-row" aria-live="polite">
      {/* slow spotlight drift behind the player (static with reduced motion) */}
      <div className="pointer-events-none absolute top-[-10%] left-[2%] h-[120%] w-[46%] animate-spotlight bg-[radial-gradient(40%_55%_at_50%_45%,rgb(255_244_214/0.16),transparent_70%)] blur-2xl" aria-hidden="true" />

      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={current.id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: -40, scale: 1.05, filter: "blur(6px)" }}
          animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: 40, transition: { duration: 0.35 } }}
          transition={{ duration: 0.7, ease: EASE }}
          className="presentation-frame relative aspect-[9/10] w-[min(78vw,44dvh)] shrink-0 fit:h-[min(60vh,34vw)] fit:w-auto"
        >
          <div className="absolute -inset-[12%] rounded-full bg-[radial-gradient(closest-side,rgb(245_217_138/0.26),transparent)] blur-2xl" aria-hidden="true" />
          <div
            className={cn(
              "relative h-full w-full transition-[filter] duration-700",
              current.status === "UNSOLD" ? "[filter:drop-shadow(0_30px_40px_rgb(0_0_0/0.7))_grayscale(0.55)]" : "[filter:drop-shadow(0_0_22px_rgb(212_167_44/0.42))_drop-shadow(0_30px_40px_rgb(0_0_0/0.7))]",
            )}
          >
            <div className="presentation-chamfer h-full w-full bg-[linear-gradient(155deg,#fdf0c4_0%,#e0b544_22%,#8a6612_50%,#d4a72c_75%,#fbe7a8_100%)] p-[var(--rim)]">
              <div className="presentation-chamfer-inner relative h-full w-full overflow-hidden bg-[#0b1220]">
                <PlayerPhoto src={current.photo} name={current.name} sizes="(min-width: 1024px) 34vw, 78vw" priority stage />
              </div>
            </div>
          </div>
          <span className="presentation-tick" data-corner="tl" aria-hidden="true" />
          <span className="presentation-tick" data-corner="br" aria-hidden="true" />
        </m.div>
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={current.id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: "inset(-30% 100% -30% 0%)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, clipPath: "inset(-30% -10% -30% 0%)" }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          transition={{ duration: 0.65, ease: EASE, delay: reduce ? 0 : 0.12 }}
          className="relative flex w-full min-w-0 flex-1 flex-col items-center text-center fit:items-start fit:text-left"
        >
          <p className="bc-eyebrow flex items-center gap-3">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold" aria-hidden="true" />
            ON THE BLOCK
          </p>
          <StageName name={current.name} />
          <span className="mt-[1.2dvh] block h-[3px] w-[min(70%,26rem)] rounded-full bg-[linear-gradient(90deg,#f5d98a,#d4a72c_45%,transparent)] shadow-[0_0_16px_rgb(245_217_138/0.6)]" aria-hidden="true" />

          <div className="mt-[2.2dvh] flex flex-wrap items-center justify-center gap-3 fit:justify-start">
            <span className="rounded-full bg-[linear-gradient(135deg,#fbe7a8_0%,#e2b94a_35%,#c8961e_70%,#a87916_100%)] px-[clamp(1rem,1.6vw,2rem)] py-[clamp(0.35rem,0.8vh,0.7rem)] font-display text-[clamp(1rem,1.5vw,1.8rem)] font-extrabold tracking-[0.18em] text-[#111827] shadow-[0_12px_40px_-12px_rgb(212_167_44/0.85)]">
              {roleText(current.role)}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <StatusBadge key={current.status} status={current.status} />
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={`${current.status}-${current.teamId}-${current.price}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mt-[3dvh]"
            >
              {current.status === "SOLD" && team ? (
                <div className="flex flex-col items-center gap-[1vh] fit:items-start">
                  <p className="flex items-center gap-3 font-display text-[clamp(1.1rem,1.8vw,2.1rem)] font-bold tracking-[0.14em]">
                    <span className="text-white/55">SOLD TO</span>
                    <TeamLogo team={team} className="size-[clamp(2.4rem,3.6vw,4rem)] text-sm" />
                    {team.name}
                  </p>
                  <p className="font-display text-[clamp(3rem,6vw,7rem)] leading-none font-extrabold text-gold-light tabular-nums drop-shadow-[0_0_28px_rgb(212_167_44/0.45)]">{inr(current.price ?? 0)}</p>
                </div>
              ) : current.status === "UNSOLD" ? (
                <p className="font-display text-[clamp(1.1rem,1.8vw,2.1rem)] font-bold tracking-[0.14em] text-red-200/90">
                  UNSOLD{current.unsoldCount > 1 ? ` ×${current.unsoldCount}` : ""} · BACK IN THE POOL
                </p>
              ) : (
                <div className="flex items-end gap-6">
                  <div>
                    <p className="text-[clamp(0.62rem,0.72vw,0.85rem)] font-extrabold tracking-[0.3em] text-white/50">BASE PRICE</p>
                    <p className="font-display text-[clamp(2.2rem,4vw,4.6rem)] leading-none font-extrabold text-emerald-300 tabular-nums">{inr(s.rules.minimumBid)}</p>
                  </div>
                  <p className="pb-[0.6vh] text-[clamp(0.62rem,0.72vw,0.85rem)] font-extrabold tracking-[0.3em] text-white/50">
                    BIDDING OPEN
                    <span className="mt-1 block text-white/35">MAX {inr(s.rules.maximumBid)}</span>
                  </p>
                </div>
              )}
            </m.div>
          </AnimatePresence>
        </m.div>
      </AnimatePresence>
    </section>
  );
}

function StageName({ name }: { name: string }) {
  const { boxRef, textRef } = useFitText<HTMLHeadingElement>(name, 18, 220);
  return (
    <div ref={boxRef} className="mt-[1.2dvh] flex h-[clamp(4.5rem,13dvh,8.5rem)] w-full flex-col justify-end fit:h-[min(22vh,15rem)]">
      <h2 ref={textRef} className="font-display text-[clamp(2.4rem,6vw,6rem)] leading-[0.88] font-extrabold tracking-[0.01em] text-balance uppercase [overflow-wrap:normal] drop-shadow-[0_6px_30px_rgb(0_0_0/0.6)]">
        {name}
      </h2>
    </div>
  );
}

const STATUS_STYLE: Record<AuctionPlayerView["status"], string> = {
  AVAILABLE: "border-emerald-300/60 bg-emerald-400/15 text-emerald-200",
  UNSOLD: "border-red-300/50 bg-red-500/15 text-red-200",
  SOLD: "border-gold bg-gold/20 text-gold-light shadow-[0_0_30px_-6px_rgb(212_167_44/0.7)]",
};

function StatusBadge({ status }: { status: AuctionPlayerView["status"] }) {
  return (
    <m.span
      initial={{ opacity: 0, scale: 1.35 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn("rounded-full border px-[clamp(0.9rem,1.3vw,1.5rem)] py-[clamp(0.3rem,0.7vh,0.6rem)] font-display text-[clamp(0.95rem,1.3vw,1.55rem)] font-extrabold tracking-[0.22em]", STATUS_STYLE[status])}
    >
      {status}
    </m.span>
  );
}

function RecentPurchases({ s, players, teams }: { s: AuctionSnapshot; players: Map<string, AuctionPlayerView>; teams: Map<string, AuctionTeamView> }) {
  const rows = s.recent.slice(0, 5);
  return (
    <section className="bc-panel flex flex-col p-[clamp(0.8rem,1.1vw,1.25rem)] fit:min-h-0 fit:flex-1" aria-label="Recent purchases">
      <h2 className="bc-eyebrow">RECENT PURCHASES</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-white/40">No players sold yet.</p>
      ) : (
        <ol className="mt-[clamp(0.5rem,1vh,0.8rem)] grid grid-cols-[minmax(0,1fr)] gap-[clamp(0.3rem,0.6vh,0.5rem)] fit:min-h-0 fit:flex-1 fit:auto-rows-fr">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((r) => {
              const p = players.get(r.playerId);
              const t = teams.get(r.teamId);
              return (
                <m.li
                  key={r.saleId}
                  layout
                  initial={{ opacity: 0, y: -14, backgroundColor: "rgba(212,167,44,0.32)" }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "rgba(255,255,255,0.035)" }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.3 } }}
                  transition={{ duration: 0.5, ease: EASE, backgroundColor: { duration: 2.4 } }}
                  className="flex min-h-0 min-w-0 items-center gap-3 rounded-xl px-[clamp(0.5rem,0.7vw,0.8rem)] py-[clamp(0.25rem,0.6vh,0.5rem)]"
                >
                  <span className="relative aspect-square h-[clamp(2.2rem,4.6vh,3.2rem)] shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10">
                    <PlayerPhoto src={p?.photo ?? null} name={p?.name ?? ""} sizes="64px" stage />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[clamp(1rem,1.25vw,1.45rem)] leading-tight font-bold uppercase">{p?.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-[clamp(0.6rem,0.68vw,0.8rem)] font-bold tracking-[0.14em] text-white/55">
                      {t && <TeamLogo team={t} className="size-[1.2em] text-[6px]" />}
                      {t?.name}
                    </span>
                  </span>
                  <span className="font-display text-[clamp(1.15rem,1.5vw,1.75rem)] font-extrabold text-gold-light tabular-nums">{inr(r.price)}</span>
                </m.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

function IconPlayers({ s }: { s: AuctionSnapshot }) {
  return (
    <section className="bc-panel shrink-0 p-[clamp(0.8rem,1.1vw,1.25rem)]" aria-label="Icon players">
      <h2 className="bc-eyebrow flex items-center gap-2">
        <Crown className="size-[1.2em]" aria-hidden="true" /> ICON PLAYERS · PRE-ASSIGNED
      </h2>
      <ul className="mt-[clamp(0.5rem,1vh,0.75rem)] grid grid-cols-2 gap-[clamp(0.3rem,0.5vw,0.5rem)]">
        {s.teams.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-[clamp(0.25rem,0.55vh,0.45rem)]">
            <IconPhoto teamId={t.id} name={t.icon?.name} className="size-[clamp(1.6rem,3.2vh,2.2rem)]" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-display text-[clamp(0.9rem,1vw,1.15rem)] font-bold uppercase">{t.icon?.name ?? "—"}</span>
              <span className="block truncate text-[clamp(0.52rem,0.56vw,0.66rem)] font-bold tracking-[0.14em] text-white/45">{t.name}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BudgetStrip({ s, changes }: { s: AuctionSnapshot; changes: Changes }) {
  const ppt = s.rules.playersPerTeam;
  return (
    <section aria-label="Team budgets" className={cn("relative z-10 shrink-0 pb-[clamp(0.75rem,1.8vh,1.5rem)]", PAD)}>
      <ul className="grid grid-cols-2 gap-[clamp(0.4rem,0.6vw,0.8rem)] sm:grid-cols-4 fit:grid-cols-8">
        {s.teams.map((t) => {
          const tone = budgetTone(t);
          const mark = changes.teams.get(t.id);
          return (
            <li key={t.id} className="bc-panel overflow-hidden px-[clamp(0.6rem,0.75vw,0.95rem)] py-[clamp(0.5rem,1.1vh,0.9rem)]">
              {mark && (
                <m.span
                  key={changes.version}
                  className={cn("pointer-events-none absolute inset-0 rounded-2xl ring-2", mark === "loss" ? "ring-red-400/80" : "ring-gold")}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 2.6, ease: "easeOut" }}
                  aria-hidden="true"
                />
              )}
              <div className="flex items-center gap-2">
                <TeamLogo team={t} className="size-[clamp(1.7rem,3.4vh,2.4rem)] text-[9px]" />
                <span className={cn("min-w-0 truncate font-display font-bold", t.name.length > 11 ? "text-[clamp(0.7rem,0.78vw,0.96rem)]" : "text-[clamp(0.8rem,0.92vw,1.12rem)]")}>{t.name}</span>
              </div>
              <p className={cn("mt-[clamp(0.25rem,0.6vh,0.5rem)] font-display text-[clamp(1.35rem,1.9vw,2.3rem)] leading-none font-extrabold tabular-nums", TONE_TEXT[tone])}>
                <AnimatedInr value={t.remaining} />
              </p>
              <div className="mt-[clamp(0.3rem,0.7vh,0.55rem)] h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <m.div className={cn("h-full rounded-full", TONE_BAR[tone])} initial={false} animate={{ width: `${(t.remaining / t.initialBudget) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
              </div>
              <p className="mt-[clamp(0.25rem,0.6vh,0.45rem)] flex justify-between gap-1 text-[clamp(0.55rem,0.62vw,0.75rem)] font-bold tracking-[0.1em] text-white/65 tabular-nums">
                <span>
                  {t.purchased}/{ppt} BOUGHT
                </span>
                <span className="text-white/45">{t.slotsLeft} LEFT</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResultOverlay({ event, player, team }: { event: AuctionEventView; player?: AuctionPlayerView; team?: AuctionTeamView }) {
  const reduce = useReducedMotion();
  // A corrected sale is announced like a sale; an undone sale like an unsold player.
  const sold = event.type === "PLAYER_SOLD" || event.type === "SALE_CORRECTED";
  const note = event.type === "SALE_CORRECTED" ? "SALE CORRECTED" : event.type === "SALE_REVERSED" ? "SALE CANCELLED" : null;
  const name = player?.name ?? "";
  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-[#03050b]/88 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      transition={{ duration: 0.35 }}
      role="status"
      aria-live="assertive"
    >
      {!reduce && (
        <m.div
          className={cn("pointer-events-none absolute inset-y-0 w-[40vw] -skew-x-12 blur-3xl", sold ? "bg-gold/25" : "bg-red-500/15")}
          initial={{ x: "-60vw" }}
          animate={{ x: "120vw" }}
          transition={{ duration: 1.6, ease: "easeInOut" }}
          aria-hidden="true"
        />
      )}
      <div className="relative flex w-full max-w-[1500px] flex-col items-center gap-[4vh] px-6 lg:flex-row lg:justify-center lg:gap-[5vw]">
        <m.div
          initial={{ opacity: 0, scale: 0.86, rotate: -2 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className="presentation-frame relative aspect-[9/10] h-[min(46vh,70vw)] shrink-0"
        >
          <div className={cn("presentation-chamfer h-full w-full p-[var(--rim)]", sold ? "bg-[linear-gradient(155deg,#fdf0c4,#e0b544_22%,#8a6612_50%,#d4a72c_75%,#fbe7a8)]" : "bg-[linear-gradient(155deg,#cbd5e1,#64748b_50%,#cbd5e1)]")}>
            <div className={cn("presentation-chamfer-inner relative h-full w-full overflow-hidden bg-[#0b1220]", !sold && "grayscale-[60%]")}>
              <PlayerPhoto src={player?.photo ?? null} name={name} sizes="(min-width: 1024px) 30vw, 70vw" stage />
            </div>
          </div>
        </m.div>

        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          {note && (
            <m.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className={cn(
                "mb-[1.5vh] rounded-full border px-4 py-1 text-[clamp(0.8rem,1.1vw,1.3rem)] font-black tracking-[0.3em]",
                sold ? "border-gold/60 bg-gold/15 text-gold-light" : "border-red-300/50 bg-red-500/15 text-red-200",
              )}
            >
              {note}
            </m.p>
          )}
          <m.p
            initial={{ opacity: 0, scale: 2.1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1], delay: 0.35 }}
            className={cn(
              "font-display text-[clamp(4.5rem,12vw,13rem)] leading-[0.82] font-extrabold tracking-[0.04em]",
              sold ? "bg-[linear-gradient(180deg,#fff7d6,#f5d98a_40%,#c8961e)] bg-clip-text text-transparent drop-shadow-[0_0_40px_rgb(212_167_44/0.5)]" : "text-red-300 drop-shadow-[0_0_30px_rgb(239_68_68/0.4)]",
            )}
          >
            {sold ? "SOLD" : "UNSOLD"}
          </m.p>
          <m.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.6 }} className="mt-[2vh] max-w-[46vw] font-display text-[clamp(1.8rem,3.6vw,4.2rem)] leading-tight font-extrabold uppercase">
            {name}
          </m.p>
          {sold && team ? (
            <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.8 }} className="mt-[3vh] flex flex-col items-center gap-[1.5vh] lg:items-start">
              <p className="flex items-center gap-4 font-display text-[clamp(1.2rem,2.2vw,2.6rem)] font-bold tracking-[0.12em]">
                <span className="text-white/60">SOLD TO</span>
                <TeamLogo team={team} className="size-[clamp(3rem,5vw,5.5rem)] text-base" />
                {team.name}
              </p>
              <p className="font-display text-[clamp(3.4rem,7.5vw,8.5rem)] leading-none font-extrabold text-gold-light tabular-nums drop-shadow-[0_0_30px_rgb(212_167_44/0.5)]">{inr(event.amount ?? 0)}</p>
            </m.div>
          ) : (
            <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-[2vh] text-[clamp(1rem,1.7vw,1.9rem)] font-bold tracking-[0.24em] text-white/60">
              {roleText(player?.role ?? null)} · BACK IN THE POOL FOR A LATER ROUND
            </m.p>
          )}
        </div>
      </div>
    </m.div>
  );
}
