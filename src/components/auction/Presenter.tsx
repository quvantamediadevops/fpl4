"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Crown, Maximize, Minimize } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AuctionEventView, AuctionPlayerView, AuctionSnapshot, AuctionTeamView } from "@/auction/types";
import { Emblem } from "@/components/layout/Logo";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { StadiumBackdrop } from "@/components/presentation/StadiumBackdrop";
import { useFitText } from "@/components/presentation/useFitText";
import { cn } from "@/lib/utils";
import { ConnectionPill, StatusPill, TONE_BAR, TONE_TEXT, TeamLogo, budgetTone, inr, roleText } from "./bits";
import { useAuctionLive } from "./useAuctionLive";

const EASE = [0.22, 1, 0.36, 1] as const;
const OVERLAY_MS = 7000;
const IDLE_MS = 2500;

const subscribeFullscreen = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};
const noop = () => () => {};

function useIdle(enabled: boolean) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let t = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [enabled]);
  return enabled && idle;
}

export function Presenter({ initial }: { initial: AuctionSnapshot | null }) {
  const { snapshot, connection } = useAuctionLive(initial);
  const isFullscreen = useSyncExternalStore(subscribeFullscreen, () => document.fullscreenElement !== null, () => false);
  const canFullscreen = useSyncExternalStore(noop, () => document.fullscreenEnabled, () => false);
  const idle = useIdle(isFullscreen);

  // Animate only events that happen while this screen is open, never on load.
  const [seenEventId] = useState(() => initial?.lastEvent?.id ?? 0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const event = snapshot?.lastEvent ?? null;
  const overlay = event && event.id > seenEventId && event.id !== dismissed && (event.type === "PLAYER_SOLD" || event.type === "PLAYER_UNSOLD") ? event : null;
  useEffect(() => {
    if (!overlay) return;
    const t = setTimeout(() => setDismissed(overlay.id), OVERLAY_MS);
    return () => clearTimeout(t);
  }, [overlay]);

  const players = useMemo(() => new Map((snapshot?.players ?? []).map((p) => [p.id, p])), [snapshot?.players]);
  const teams = useMemo(() => new Map((snapshot?.teams ?? []).map((t) => [t.id, t])), [snapshot?.teams]);

  if (!snapshot) {
    return (
      <div data-standalone className="fixed inset-0 grid place-items-center text-white">
        <StadiumBackdrop />
        <p className="relative text-sm font-bold tracking-[0.4em] text-gold-light">CONNECTING TO THE AUCTION…</p>
      </div>
    );
  }

  const current = snapshot.currentPlayerId ? players.get(snapshot.currentPlayerId) ?? null : null;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  };

  return (
    <div data-standalone className={cn("fixed inset-0 flex flex-col overflow-y-auto text-white antialiased lg:overflow-hidden", idle && "cursor-none")}>
      <StadiumBackdrop />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 px-[clamp(1rem,2.6vw,3.5rem)] pt-[clamp(0.75rem,2vh,1.75rem)]">
        <div className="flex min-w-0 items-center gap-3 lg:gap-4">
          <Emblem className="h-11 w-10 drop-shadow-[0_0_16px_rgb(212_167_44/0.5)] lg:h-[clamp(2.75rem,5.5vh,4rem)] lg:w-[clamp(2.5rem,5vh,3.65rem)]" />
          <div className="min-w-0 leading-tight">
            <p className="text-[clamp(0.7rem,1.05vw,1.15rem)] font-extrabold tracking-[0.12em] sm:tracking-[0.18em]">
              FERTILIZER<br className="sm:hidden" /> PREMIER LEAGUE
            </p>
            <p className="mt-1 text-[clamp(0.6rem,0.85vw,0.95rem)] font-bold tracking-[0.24em] text-gold sm:tracking-[0.34em]">
              SEASON 4 <span className="hidden sm:inline">· PLAYER </span>AUCTION
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Only shown when something is wrong, so the audience never sees technical status. */}
          {connection !== "live" && <ConnectionPill connection={connection} />}
          <StatusPill status={snapshot.status} className="text-[clamp(0.7rem,0.9vw,1rem)]" />
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-opacity duration-500 focus-visible:outline-2 focus-visible:outline-gold sm:px-4",
                isFullscreen ? "border-white/10 text-white/55" : "border-gold/80 bg-gold/15 text-gold-light shadow-[0_0_24px_-6px_rgb(212_167_44/0.7)]",
                idle && "opacity-0",
              )}
            >
              {isFullscreen ? <Minimize className="size-4" aria-hidden="true" /> : <Maximize className="size-4" aria-hidden="true" />}
              <span className="hidden sm:inline">{isFullscreen ? "Exit" : "Fullscreen"}</span>
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 grid flex-none gap-[clamp(1rem,2vw,2.5rem)] px-[clamp(1rem,2.6vw,3.5rem)] py-[clamp(0.75rem,2vh,1.75rem)] lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,30%)]">
        <Stage snapshot={snapshot} current={current} teams={teams} />
        <aside className="flex flex-col gap-[clamp(0.75rem,1.6vh,1.25rem)]">
          <Recent snapshot={snapshot} players={players} teams={teams} />
          <Icons snapshot={snapshot} />
        </aside>
      </div>

      <Scoreboard snapshot={snapshot} />

      <AnimatePresence>{overlay && <ResultOverlay key={overlay.id} event={overlay} player={players.get(overlay.playerId ?? "")} team={teams.get(overlay.teamId ?? "")} />}</AnimatePresence>
    </div>
  );
}

function Stage({ snapshot, current, teams }: { snapshot: AuctionSnapshot; current: AuctionPlayerView | null; teams: Map<string, AuctionTeamView> }) {
  const reduce = useReducedMotion();
  if (!current) {
    const text = snapshot.status === "COMPLETED" ? "AUCTION COMPLETE" : snapshot.status === "NOT_STARTED" ? "AUCTION STARTS SHORTLY" : snapshot.status === "PAUSED" ? "AUCTION PAUSED" : "NEXT PLAYER COMING UP";
    return (
      <section className="grid place-items-center rounded-3xl border border-white/5 bg-black/10 py-16" aria-live="polite">
        <div className="text-center">
          <Emblem className="mx-auto h-28 w-24 drop-shadow-[0_0_40px_rgb(212_167_44/0.6)]" />
          <p className="mt-6 text-[clamp(1.5rem,3.2vw,3.5rem)] font-black tracking-[0.08em]">{text}</p>
          <p className="mt-2 text-sm font-bold tracking-[0.4em] text-gold-light">{snapshot.counts.sold} OF {snapshot.counts.pool} PLAYERS SOLD</p>
        </div>
      </section>
    );
  }
  const team = current.teamId ? teams.get(current.teamId) : undefined;
  return (
    <section className="flex flex-col items-center gap-[clamp(1rem,2.4vw,3rem)] lg:min-h-0 lg:flex-row" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={current.id}
          initial={{ opacity: 0, x: -30, scale: 1.04 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="presentation-frame relative aspect-[9/10] w-[min(76vw,46dvh)] shrink-0 lg:h-[min(62vh,36vw)] lg:w-auto"
        >
          <div className="absolute -inset-[10%] rounded-full bg-[radial-gradient(closest-side,rgb(245_217_138/0.28),transparent)] blur-2xl" aria-hidden="true" />
          <div className="relative h-full w-full [filter:drop-shadow(0_0_22px_rgb(212_167_44/0.45))_drop-shadow(0_30px_40px_rgb(0_0_0/0.7))]">
            <div className="presentation-chamfer h-full w-full bg-[linear-gradient(155deg,#fdf0c4_0%,#e0b544_22%,#8a6612_50%,#d4a72c_75%,#fbe7a8_100%)] p-[var(--rim)]">
              <div className="presentation-chamfer-inner relative h-full w-full overflow-hidden bg-[#0b1220]">
                <PlayerPhoto src={current.photo} name={current.name} sizes="(min-width: 1024px) 36vw, 76vw" priority stage />
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
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex w-full min-w-0 flex-1 flex-col items-center text-center lg:items-start lg:text-left"
        >
          <p className="flex items-center gap-3 text-[clamp(0.7rem,1vw,1.15rem)] font-bold tracking-[0.42em] text-gold-light">
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold" aria-hidden="true" />
            ON THE BLOCK
          </p>
          <StageName name={current.name} />
          <span className="mt-[1.2dvh] block h-[3px] w-[min(70%,26rem)] rounded-full bg-[linear-gradient(90deg,#f5d98a,#d4a72c_45%,transparent)] shadow-[0_0_18px_rgb(245_217_138/0.7)]" aria-hidden="true" />
          <div className="mt-[2.2dvh] flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            {current.role && (
              <span className="rounded-full bg-[linear-gradient(135deg,#fbe7a8_0%,#e2b94a_35%,#c8961e_70%,#a87916_100%)] px-[clamp(1rem,1.8vw,2.2rem)] py-[clamp(0.4rem,0.9vh,0.8rem)] text-[clamp(0.85rem,1.4vw,1.7rem)] font-black tracking-[0.22em] text-[#111827] shadow-[0_12px_44px_-10px_rgb(212_167_44/0.85)]">
                {roleText(current.role)}
              </span>
            )}
            <StatusBadge player={current} team={team} />
          </div>
          {current.status === "SOLD" && team && (
            <p className="mt-[2.4dvh] flex items-center gap-3 text-[clamp(1rem,1.8vw,2rem)] font-black">
              <TeamLogo team={team} className="size-[clamp(2.5rem,4vw,4rem)] text-sm" />
              {team.name}
              <span className="text-gold-light tabular-nums">{inr(current.price ?? 0)}</span>
            </p>
          )}
        </m.div>
      </AnimatePresence>
    </section>
  );
}

function StageName({ name }: { name: string }) {
  const { boxRef, textRef } = useFitText<HTMLHeadingElement>(name, 26, 180);
  return (
    <div ref={boxRef} className="mt-[1.4dvh] flex h-[clamp(4.5rem,13dvh,8rem)] w-full flex-col justify-end lg:h-[min(22vh,14rem)]">
      <h1 ref={textRef} className="text-[clamp(2rem,5vw,5rem)] leading-[0.92] font-black tracking-[-0.015em] text-balance uppercase [overflow-wrap:normal] drop-shadow-[0_6px_30px_rgb(0_0_0/0.65)]">
        {name}
      </h1>
    </div>
  );
}

function StatusBadge({ player, team }: { player: AuctionPlayerView; team?: AuctionTeamView }) {
  const map = {
    AVAILABLE: ["AVAILABLE", "border-emerald-300/60 bg-emerald-400/15 text-emerald-200"],
    UNSOLD: ["UNSOLD", "border-red-300/50 bg-red-500/15 text-red-200"],
    SOLD: [team ? `SOLD` : "SOLD", "border-gold bg-gold/20 text-gold-light"],
  } as const;
  const [text, cls] = map[player.status];
  return <span className={cn("rounded-full border px-[clamp(0.9rem,1.4vw,1.6rem)] py-[clamp(0.35rem,0.8vh,0.7rem)] text-[clamp(0.8rem,1.2vw,1.4rem)] font-black tracking-[0.24em]", cls)}>{text}</span>;
}

function Recent({ snapshot, players, teams }: { snapshot: AuctionSnapshot; players: Map<string, AuctionPlayerView>; teams: Map<string, AuctionTeamView> }) {
  const rows = snapshot.recent.slice(0, 6);
  return (
    <section className="overflow-hidden rounded-3xl border border-gold/20 lg:min-h-0 lg:flex-1 bg-[#070c18]/75 p-[clamp(0.9rem,1.3vw,1.4rem)] backdrop-blur-md">
      <h2 className="text-[clamp(0.7rem,0.85vw,0.95rem)] font-extrabold tracking-[0.3em] text-gold-light">RECENT PURCHASES</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-white/40">No players sold yet.</p>
      ) : (
        <ol className="mt-3 space-y-[clamp(0.3rem,0.7vh,0.6rem)]">
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const p = players.get(r.playerId);
              const t = teams.get(r.teamId);
              return (
                <m.li key={r.saleId} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-[clamp(0.35rem,0.8vh,0.6rem)]">
                  {t && <TeamLogo team={t} className="size-[clamp(1.9rem,2.4vw,2.6rem)] text-xs" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[clamp(0.85rem,1.05vw,1.2rem)] font-black uppercase">{p?.name}</span>
                    <span className="block truncate text-[clamp(0.6rem,0.7vw,0.8rem)] font-bold tracking-[0.18em] text-white/50">{t?.name}</span>
                  </span>
                  <span className="text-[clamp(0.95rem,1.25vw,1.45rem)] font-black tabular-nums text-gold-light">{inr(r.price)}</span>
                </m.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

function Icons({ snapshot }: { snapshot: AuctionSnapshot }) {
  return (
    <section className="shrink-0 rounded-3xl border border-gold/20 bg-[#070c18]/75 p-[clamp(0.9rem,1.3vw,1.4rem)] backdrop-blur-md">
      <h2 className="flex items-center gap-2 text-[clamp(0.7rem,0.85vw,0.95rem)] font-extrabold tracking-[0.3em] text-gold-light">
        <Crown className="size-4" aria-hidden="true" /> ICON PLAYERS · PRE-ASSIGNED
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-[clamp(0.35rem,0.6vw,0.6rem)]">
        {snapshot.teams.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2 py-[clamp(0.3rem,0.6vh,0.5rem)]">
            <span className="relative size-[clamp(1.9rem,2.2vw,2.5rem)] shrink-0 overflow-hidden rounded-full ring-1 ring-gold/50">
              <PlayerPhoto src={null} name={t.icon?.name ?? t.name} sizes="48px" stage />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[clamp(0.75rem,0.9vw,1rem)] font-black uppercase">{t.icon?.name ?? "—"}</span>
              <span className="flex items-center gap-1 truncate text-[clamp(0.55rem,0.62vw,0.72rem)] font-bold tracking-[0.14em] text-white/50">
                <TeamLogo team={t} className="size-3.5 text-[6px]" /> {t.name}
              </span>
            </span>
            <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[9px] font-black tracking-[0.18em] text-gold-light">ICON</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Scoreboard({ snapshot }: { snapshot: AuctionSnapshot }) {
  const ppt = snapshot.rules.playersPerTeam;
  return (
    <section aria-label="Team budgets" className="relative z-10 shrink-0 px-[clamp(1rem,2.6vw,3.5rem)] pb-[clamp(0.75rem,2vh,1.75rem)]">
      <ul className="grid grid-cols-2 gap-[clamp(0.4rem,0.7vw,0.9rem)] sm:grid-cols-4 lg:grid-cols-8">
        {snapshot.teams.map((t) => {
          const tone = budgetTone(t);
          return (
            <li key={t.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#070c18]/85 px-[clamp(0.6rem,0.8vw,1rem)] py-[clamp(0.6rem,1.2vh,1rem)] backdrop-blur-md">
              <div className="flex items-center gap-2">
                <TeamLogo team={t} className="size-[clamp(1.9rem,2.1vw,2.5rem)] text-xs" />
                <span className="min-w-0 truncate text-[clamp(0.72rem,0.84vw,1rem)] font-black">{t.name}</span>
              </div>
              <p className={cn("mt-[clamp(0.3rem,0.8vh,0.6rem)] text-[clamp(1.2rem,1.75vw,2.1rem)] font-black leading-none tabular-nums", TONE_TEXT[tone])}>
                {inr(t.remaining)}
                <span className="mt-1 block text-[0.45em] tracking-[0.22em] text-white/50">LEFT</span>
              </p>
              <div className="mt-[clamp(0.3rem,0.8vh,0.6rem)] h-1.5 overflow-hidden rounded-full bg-white/10">
                <m.div className={cn("h-full rounded-full", TONE_BAR[tone])} animate={{ width: `${(t.purchased / ppt) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
              </div>
              <p className="mt-[clamp(0.3rem,0.7vh,0.5rem)] flex justify-between text-[clamp(0.6rem,0.72vw,0.85rem)] font-bold tracking-wide text-white/70">
                <span className="tabular-nums">
                  {t.purchased} / {ppt} PLAYERS
                </span>
                <span className="tabular-nums text-white/45">{t.slotsLeft} LEFT</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResultOverlay({ event, player, team }: { event: AuctionEventView; player?: AuctionPlayerView; team?: AuctionTeamView }) {
  const sold = event.type === "PLAYER_SOLD";
  const name = player?.name ?? "";
  return (
    <m.div
      className="fixed inset-0 z-50 grid place-items-center bg-[#03050b]/85 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      transition={{ duration: 0.35 }}
      role="status"
      aria-live="assertive"
    >
      {/* light sweep */}
      <m.div
        className={cn("pointer-events-none absolute inset-y-0 w-[40vw] -skew-x-12 blur-3xl", sold ? "bg-gold/25" : "bg-red-500/15")}
        initial={{ x: "-60vw" }}
        animate={{ x: "120vw" }}
        transition={{ duration: 1.6, ease: "easeInOut" }}
        aria-hidden="true"
      />
      <div className="relative flex w-full max-w-[1500px] flex-col items-center gap-[4vh] px-6 lg:flex-row lg:justify-center lg:gap-[5vw]">
        <m.div
          initial={{ opacity: 0, scale: 0.85, rotate: -2 }}
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
          <m.p
            initial={{ opacity: 0, scale: 2.2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1], delay: 0.35 }}
            className={cn(
              "text-[clamp(4rem,11vw,12rem)] leading-[0.85] font-black tracking-[0.04em]",
              sold ? "bg-[linear-gradient(180deg,#fff7d6,#f5d98a_40%,#c8961e)] bg-clip-text text-transparent drop-shadow-[0_0_40px_rgb(212_167_44/0.55)]" : "text-red-300 drop-shadow-[0_0_30px_rgb(239_68_68/0.45)]",
            )}
          >
            {sold ? "SOLD" : "UNSOLD"}
          </m.p>
          <m.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.6 }} className="mt-[2vh] max-w-[46vw] text-[clamp(1.6rem,3.4vw,3.8rem)] leading-tight font-black uppercase">
            {name}
          </m.p>
          {sold && team ? (
            <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.8 }} className="mt-[3vh] flex flex-col items-center gap-[1.5vh] lg:items-start">
              <p className="flex items-center gap-4 text-[clamp(1.1rem,2.2vw,2.6rem)] font-black tracking-[0.12em]">
                <span className="text-white/60">SOLD TO</span>
                <TeamLogo team={team} className="size-[clamp(3rem,5vw,5.5rem)] text-base" />
                {team.name}
              </p>
              <p className="text-[clamp(3rem,7vw,8rem)] leading-none font-black tabular-nums text-gold-light drop-shadow-[0_0_30px_rgb(212_167_44/0.5)]">{inr(event.amount ?? 0)}</p>
            </m.div>
          ) : (
            <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-[2vh] text-[clamp(1rem,1.8vw,2rem)] font-bold tracking-[0.24em] text-white/60">
              {roleText(player?.role ?? null)} · BACK IN THE POOL FOR A LATER ROUND
            </m.p>
          )}
        </div>
      </div>
    </m.div>
  );
}
