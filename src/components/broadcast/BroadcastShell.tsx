"use client";

import { Maximize, Minimize } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AuctionSnapshot } from "@/auction/types";
import { StatusPill } from "@/components/auction/bits";
import type { Connection } from "@/components/auction/useAuctionLive";
import { Emblem } from "@/components/layout/Logo";
import { StadiumBackdrop } from "@/components/presentation/StadiumBackdrop";
import { cn } from "@/lib/utils";
import { ArenaBackdrop } from "./ArenaBackdrop";
import { useLive } from "./LiveProvider";

export const SCREENS = [
  { key: "1", href: "/player-presentation", label: "PLAYERS", title: "Player presentation" },
  { key: "2", href: "/team-squads", label: "SQUADS", title: "Team squads live" },
  { key: "3", href: "/auction-summary", label: "SUMMARY", title: "Auction summary" },
] as const;

const IDLE_MS = 2500;
const subscribeFullscreen = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};
const noop = () => () => {};

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
}

/** Controls fade out after a moment without input while the screen is fullscreen. */
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

/** 1 / 2 / 3 switch screens, F toggles fullscreen. Ignored while typing or with modifier keys. */
function useScreenKeys(pathname: string) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const screen = SCREENS.find((s) => s.key === e.key);
      if (screen) {
        e.preventDefault();
        if (screen.href !== pathname) router.push(screen.href, { scroll: false });
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);
  useEffect(() => {
    for (const s of SCREENS) if (s.href !== pathname) router.prefetch(s.href);
  }, [pathname, router]);
}

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

function LiveIndicator({ connection, updatedAt }: { connection: Connection; updatedAt: string }) {
  const live = connection === "live";
  return (
    <span role="status" className="flex items-center gap-2 text-[clamp(0.62rem,0.7vw,0.82rem)] font-bold tracking-[0.16em]">
      <span className="relative flex size-2.5" aria-hidden="true">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 [animation-duration:2.4s]" />}
        <span className={cn("relative inline-flex size-2.5 rounded-full", live ? "bg-emerald-400" : "animate-pulse bg-amber-400")} />
      </span>
      <span className={live ? "text-emerald-300" : "text-amber-300"}>{live ? "CONNECTED" : connection === "connecting" ? "CONNECTING" : "RECONNECTING"}</span>
      <span className="hidden text-white/45 sm:inline">
        {live ? "UPDATED" : "LAST UPDATE"} <time suppressHydrationWarning>{clock(updatedAt)}</time>
      </span>
    </span>
  );
}

export function BroadcastShell({
  eyebrow,
  title,
  sub,
  backdrop = "arena",
  children,
}: {
  eyebrow: string;
  title: string;
  /** Live figures shown in the header beside the screen tabs. */
  sub?: (snapshot: AuctionSnapshot) => ReactNode;
  backdrop?: "stadium" | "arena";
  children: (snapshot: AuctionSnapshot) => ReactNode;
}) {
  const { snapshot, connection } = useLive();
  const pathname = usePathname();
  const isFullscreen = useSyncExternalStore(subscribeFullscreen, () => document.fullscreenElement !== null, () => false);
  const canFullscreen = useSyncExternalStore(noop, () => document.fullscreenEnabled, () => false);
  const idle = useIdle(isFullscreen);
  useScreenKeys(pathname);

  return (
    <div
      data-standalone
      className={cn("fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto text-white antialiased fit:overflow-hidden", idle && "cursor-none")}
    >
      {backdrop === "stadium" ? <StadiumBackdrop /> : <ArenaBackdrop />}

      <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-[clamp(1rem,1.6vw,2rem)] gap-y-3 px-[clamp(1rem,2.2vw,3rem)] pt-[clamp(0.75rem,1.8vh,1.5rem)]">
        <div className="flex min-w-0 items-center gap-3">
          <Emblem className="h-[clamp(2.5rem,5vh,3.6rem)] w-[clamp(2.25rem,4.5vh,3.25rem)] drop-shadow-[0_0_18px_rgb(212_167_44/0.45)]" />
          <div className="min-w-0 leading-none">
            <p className="font-display text-[clamp(0.95rem,1.25vw,1.45rem)] font-bold tracking-[0.14em]">FERTILIZER PREMIER LEAGUE</p>
            <p className="mt-1 text-[clamp(0.58rem,0.66vw,0.78rem)] font-extrabold tracking-[0.34em] text-gold">SEASON 4 · PLAYER AUCTION</p>
          </div>
        </div>
        <span className="hidden h-[clamp(2rem,4.5vh,3rem)] w-px bg-gradient-to-b from-transparent via-gold/50 to-transparent md:block" aria-hidden="true" />
        <div className="min-w-0 leading-none">
          <p className="bc-eyebrow">{eyebrow}</p>
          <h1 className="mt-1 font-display text-[clamp(1.35rem,2.1vw,2.5rem)] font-extrabold tracking-[0.06em] uppercase">{title}</h1>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-x-[clamp(0.6rem,1vw,1.25rem)] gap-y-2">
          {snapshot && <LiveIndicator connection={connection} updatedAt={snapshot.updatedAt} />}
          {snapshot && <StatusPill status={snapshot.status} className="text-[clamp(0.62rem,0.7vw,0.85rem)]" />}
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold tracking-[0.14em] transition-opacity duration-500 focus-visible:outline-2 focus-visible:outline-gold",
                isFullscreen ? "border-white/10 text-white/55" : "border-gold/60 bg-gold/10 text-gold-light",
                idle && "pointer-events-none opacity-0",
              )}
            >
              {isFullscreen ? <Minimize className="size-4" aria-hidden="true" /> : <Maximize className="size-4" aria-hidden="true" />}
              <span className="hidden sm:inline">{isFullscreen ? "EXIT" : "FULLSCREEN"}</span>
            </button>
          )}
        </div>

        <nav
          aria-label="Presentation screens"
          className={cn("order-last flex w-full gap-1 rounded-xl border border-white/10 bg-[#070b16]/90 p-1 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.9)] backdrop-blur-md transition-opacity duration-500 lg:order-none lg:w-auto", idle && "pointer-events-none opacity-0")}
        >
          {SCREENS.map((s) => {
            const active = s.href === pathname;
            return (
              <Link
                key={s.href}
                href={s.href}
                scroll={false}
                aria-current={active ? "page" : undefined}
                title={`${s.title} (key ${s.key})`}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-extrabold tracking-[0.18em] transition-colors lg:flex-none",
                  active ? "bg-gold text-[#111827] shadow-[0_6px_20px_-8px_rgb(212_167_44/0.9)]" : "text-white/65 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                <kbd className={cn("hidden rounded px-1 font-sans text-[10px] sm:inline", active ? "bg-black/15" : "bg-white/10")}>{s.key}</kbd>
                {s.label}
              </Link>
            );
          })}
        </nav>
        {sub && snapshot && <div className="order-last flex w-full flex-wrap items-center gap-x-4 gap-y-1 lg:order-none lg:w-auto">{sub(snapshot)}</div>}
      </header>

      {snapshot ? (
        children(snapshot)
      ) : (
        <div className="relative z-10 grid flex-1 place-items-center">
          <p className="text-sm font-bold tracking-[0.4em] text-gold-light">CONNECTING TO THE AUCTION…</p>
        </div>
      )}

      {snapshot && connection === "reconnecting" && (
        <p role="alert" className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-amber-300/40 bg-[#1a1405]/90 px-4 py-1.5 text-[11px] font-bold tracking-[0.18em] text-amber-200 backdrop-blur-md">
          RECONNECTING — SHOWING LAST UPDATE <time suppressHydrationWarning>{clock(snapshot.updatedAt)}</time>
        </p>
      )}
    </div>
  );
}
