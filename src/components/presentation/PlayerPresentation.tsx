"use client";

import { AnimatePresence, m, useReducedMotion, type Variants } from "motion/react";
import { ChevronLeft, ChevronRight, List, Maximize, Minimize, Search } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Emblem } from "@/components/layout/Logo";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";
import type { PublicPlayer } from "@/types/player";
import { PresentationPlayerList } from "./PresentationPlayerList";
import { PresentationSearch } from "./PresentationSearch";
import { StadiumBackdrop } from "./StadiumBackdrop";
import { ROLE_DISPLAY, padPosition } from "./shared";
import { useFitText } from "./useFitText";

/** The photo frame is ~40% of the viewport width side by side, ~70% when stacked. */
const PHOTO_SIZES = "(min-width: 1024px) 42vw, 70vw";
const PHOTO_WIDTHS = [240, 480, 960];
const IDLE_MS = 2500;
const EASE = [0.22, 1, 0.36, 1] as const;

const photoVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28, scale: 1.06 }),
  center: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.75, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -28, scale: 0.98, transition: { duration: 0.45, ease: EASE } }),
};

const identityVariants: Variants = {
  enter: {},
  center: { transition: { staggerChildren: 0.1, delayChildren: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.22 } },
};

const riseVariants: Variants = {
  enter: { opacity: 0, y: 14 },
  center: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const underlineVariants: Variants = {
  enter: { opacity: 0, scaleX: 0 },
  center: { opacity: 1, scaleX: 1, transition: { duration: 0.7, ease: EASE } },
};

// Broadcast-style wipe for the name; plain fade when reduced motion is requested.
const nameWipe: Variants = {
  enter: { opacity: 0, clipPath: "inset(-30% 100% -30% 0%)" },
  center: { opacity: 1, clipPath: "inset(-30% -10% -30% 0%)", transition: { duration: 0.7, ease: EASE } },
};
const nameFade: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.4 } },
};

const subscribeFullscreen = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};
const noopSubscribe = () => () => {};

function useFullscreen() {
  const isFullscreen = useSyncExternalStore(subscribeFullscreen, () => document.fullscreenElement !== null, () => false);
  const supported = useSyncExternalStore(noopSubscribe, () => document.fullscreenEnabled, () => false);
  return { isFullscreen, supported };
}

/** True once the pointer/keyboard has been still for IDLE_MS while `enabled`. */
function useIdle(enabled: boolean) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    const events = ["pointermove", "pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [enabled]);
  return enabled && idle;
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function PlayerPresentation({ players, initialIndex }: { players: PublicPlayer[]; initialIndex: number }) {
  const total = players.length;
  const [[index, direction], setPosition] = useState<[number, number]>([initialIndex, 0]);
  const [panel, setPanel] = useState<"search" | "list" | null>(null);
  const { isFullscreen, supported: fullscreenSupported } = useFullscreen();
  const idle = useIdle(isFullscreen);
  const reduceMotion = useReducedMotion();
  const player = players[index];

  const goTo = useCallback(
    (next: number) =>
      setPosition(([current, dir]) => {
        const target = Math.min(Math.max(next, 0), total - 1);
        return target === current ? [current, dir] : [target, Math.sign(target - current)];
      }),
    [total],
  );

  const select = useCallback(
    (next: number) => {
      goTo(next);
      setPanel(null);
    },
    [goTo],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      setPanel(null);
      void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
  }, []);

  // Keep ?p= in step so a refresh or a shared link lands on the same player.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("p", String(index + 1));
    window.history.replaceState(null, "", url);
  }, [index]);

  // Keyboard and presentation clickers (which send PageUp/PageDown).
  useEffect(() => {
    if (panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setPosition(([current, dir]) => (current < total - 1 ? [current + 1, 1] : [current, dir]));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setPosition(([current, dir]) => (current > 0 ? [current - 1, -1] : [current, dir]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, total]);

  // Warm the neighbouring photos at the same rendition the frame will request.
  useEffect(() => {
    for (const i of [index + 1, index - 1]) {
      const src = players[i]?.photo;
      if (!src) continue;
      const img = new window.Image();
      img.sizes = PHOTO_SIZES;
      img.srcset = PHOTO_WIDTHS.map((w) => `${src}?w=${w} ${w}w`).join(", ");
    }
  }, [index, players]);

  if (!player) return null;

  const showChrome = !isFullscreen;

  return (
    <div data-presentation className={cn("fixed inset-0 z-50 flex flex-col overflow-hidden text-white antialiased", idle && "cursor-none")}>
      <StadiumBackdrop />

      {/* Header: league lockup and controls */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-[clamp(1rem,3vw,3.5rem)] pt-[clamp(0.75rem,2.4vh,2.25rem)]">
        <div className="flex min-w-0 items-center gap-3 wide:gap-4">
          <Emblem className="h-10 w-9 drop-shadow-[0_0_16px_rgb(212_167_44/0.5)] wide:h-[clamp(2.75rem,5.5vh,4rem)] wide:w-[clamp(2.5rem,5vh,3.65rem)]" />
          <div className="min-w-0 leading-tight">
            <p className="text-[clamp(0.68rem,1.05vw,1.15rem)] font-extrabold tracking-[0.12em] sm:tracking-[0.18em]">
              FERTILIZER<br className="sm:hidden" /> PREMIER LEAGUE
            </p>
            <p className="mt-1 text-[clamp(0.6rem,0.85vw,0.95rem)] font-bold tracking-[0.34em] text-gold">{site.seasonUpper}</p>
          </div>
        </div>

        <div className={cn("flex shrink-0 items-center gap-2 transition-opacity duration-500 wide:gap-3", idle && "opacity-0")}>
          {showChrome && (
            <>
              <ChromeButton label="Search Player" icon={<Search />} onClick={() => setPanel("search")} />
              <ChromeButton label="Player List" icon={<List />} onClick={() => setPanel("list")} />
            </>
          )}
          {fullscreenSupported && (
            <ChromeButton
              label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              icon={isFullscreen ? <Minimize /> : <Maximize />}
              onClick={toggleFullscreen}
              tone={isFullscreen ? "quiet" : "gold"}
            />
          )}
        </div>
      </header>

      {/* Stage */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-[2.4dvh] px-[clamp(1rem,6.5vw,8rem)] wide:grid wide:grid-cols-[44%_minmax(0,1fr)] wide:gap-[clamp(2rem,4vw,6rem)]">
        <PhotoFrame player={player} direction={direction} isFullscreen={isFullscreen} />

        <div className="flex w-full min-w-0 flex-col items-center text-center wide:items-start wide:text-left">
          <BrandLockup />

          <p className="flex items-center gap-3 text-[clamp(0.68rem,1.05vw,1.2rem)] font-bold tracking-[0.42em] text-gold-light">
            <span className="h-px w-[clamp(1.5rem,3.2vw,4.5rem)] bg-gradient-to-r from-transparent to-gold" aria-hidden="true" />
            PLAYER INTRODUCTION
            <span className="h-px w-[clamp(1.5rem,3.2vw,4.5rem)] bg-gradient-to-l from-transparent to-gold" aria-hidden="true" />
          </p>

          <div className="mt-[1.6dvh] grid w-full">
            <AnimatePresence initial={false}>
              <m.div
                key={player.id}
                variants={identityVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex min-w-0 flex-col items-center [grid-area:1/1] wide:items-start"
              >
                <m.div variants={reduceMotion ? nameFade : nameWipe} className="w-full">
                  <PlayerName name={player.name} large={isFullscreen} />
                </m.div>
                <m.span
                  variants={underlineVariants}
                  className="mt-[1.4dvh] block h-[3px] w-[min(70%,30rem)] origin-center rounded-full bg-[linear-gradient(90deg,transparent,#f5d98a_25%,#d4a72c_60%,transparent)] shadow-[0_0_18px_rgb(245_217_138/0.7)] wide:origin-left wide:bg-[linear-gradient(90deg,#f5d98a,#d4a72c_45%,transparent)]"
                  aria-hidden="true"
                />
                {player.role && (
                  <m.span
                    variants={riseVariants}
                    className="relative mt-[2.6dvh] inline-flex items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#fbe7a8_0%,#e2b94a_35%,#c8961e_70%,#a87916_100%)] px-[clamp(1.25rem,2.2vw,2.6rem)] py-[clamp(0.45rem,1.1vh,0.95rem)] text-[clamp(0.85rem,1.6vw,1.95rem)] font-black tracking-[0.24em] text-[#111827] shadow-[0_12px_44px_-10px_rgb(212_167_44/0.85),inset_0_1px_0_rgb(255_255_255/0.6),inset_0_-2px_0_rgb(0_0_0/0.15)]"
                  >
                    <span className="absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(100deg,transparent,rgb(255_255_255/0.35),transparent)]" aria-hidden="true" />
                    <span className="relative">{ROLE_DISPLAY[player.role]}</span>
                  </m.span>
                )}
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Navigation: arrows at the screen edges side by side, beside the counter when stacked */}
      <footer className="relative z-10 flex shrink-0 items-center justify-center gap-[clamp(0.75rem,4vw,2rem)] px-4 pt-[1.5dvh] pb-[max(clamp(0.9rem,2.8vh,2.5rem),env(safe-area-inset-bottom))] wide:static">
        <NavButton direction="previous" disabled={index === 0} quiet={isFullscreen} hidden={idle} onClick={() => goTo(index - 1)} />
        <p className="relative z-10 flex items-center gap-[clamp(0.6rem,1.2vw,1.25rem)] rounded-full border border-gold/25 bg-black/35 px-[clamp(1rem,1.8vw,2rem)] py-[clamp(0.45rem,0.9vh,0.75rem)] text-[clamp(0.8rem,1.1vw,1.3rem)] font-bold tracking-[0.28em] whitespace-nowrap tabular-nums backdrop-blur-md">
          <span className="text-white/55">PLAYER</span>
          <span className="text-[1.25em] text-gold-light">{padPosition(index + 1, total)}</span>
          <span className="text-white/35">/ {padPosition(total, total)}</span>
        </p>
        <NavButton direction="next" disabled={index === total - 1} quiet={isFullscreen} hidden={idle} onClick={() => goTo(index + 1)} />
      </footer>

      <p className="sr-only" aria-live="polite">
        {`${player.name}${player.role ? `, ${ROLE_DISPLAY[player.role].toLowerCase()}` : ""}. Player ${index + 1} of ${total}.`}
      </p>

      <AnimatePresence>
        {panel === "search" && showChrome && (
          <PresentationSearch key="search" players={players} currentIndex={index} onSelect={select} onClose={() => setPanel(null)} />
        )}
        {panel === "list" && showChrome && (
          <PresentationPlayerList key="list" players={players} currentIndex={index} onSelect={select} onClose={() => setPanel(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PhotoFrame({ player, direction, isFullscreen }: { player: PublicPlayer; direction: number; isFullscreen: boolean }) {
  return (
    <div
      className={cn(
        "presentation-frame relative aspect-[9/10] w-[min(70vw,38dvh)] shrink-0 wide:w-auto wide:justify-self-center",
        isFullscreen ? "wide:h-[min(80vh,46vw,calc(100dvh-8rem))]" : "wide:h-[min(74vh,44vw,calc(100dvh-10rem))]",
      )}
    >
      {/* glow behind the frame and a light pool beneath it */}
      <div className="absolute -inset-[10%] rounded-full bg-[radial-gradient(closest-side,rgb(245_217_138/0.30),rgb(212_167_44/0.12)_55%,transparent)] blur-2xl" aria-hidden="true" />
      <div className="absolute inset-x-[8%] -bottom-[7%] h-[12%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(245_217_138/0.45),transparent)] blur-xl" aria-hidden="true" />

      <div className="relative h-full w-full [filter:drop-shadow(0_0_22px_rgb(212_167_44/0.45))_drop-shadow(0_30px_40px_rgb(0_0_0/0.7))]">
        <div className="presentation-chamfer h-full w-full bg-[linear-gradient(155deg,#fdf0c4_0%,#e0b544_22%,#8a6612_50%,#d4a72c_75%,#fbe7a8_100%)] p-[var(--rim)]">
          <div className="presentation-chamfer-inner relative h-full w-full overflow-hidden bg-[#0b1220]">
            <AnimatePresence initial={false} custom={direction}>
              <m.div key={player.id} custom={direction} variants={photoVariants} initial="enter" animate="center" exit="exit" className="absolute inset-0">
                <PlayerPhoto src={player.photo} name={player.name} sizes={PHOTO_SIZES} priority stage />
              </m.div>
            </AnimatePresence>
            {/* inner light: top sheen and bottom shade so the frame reads as lit */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(255_255_255/0.08),transparent_22%,transparent_70%,rgb(0_0_0/0.45))]" aria-hidden="true" />
          </div>
        </div>
      </div>

      <span className="presentation-tick" data-corner="tl" aria-hidden="true" />
      <span className="presentation-tick" data-corner="br" aria-hidden="true" />
    </div>
  );
}

/** League lockup above the introduction; only where there is height for it. */
function BrandLockup() {
  return (
    <div className="mb-[3vh] hidden items-center gap-4 wide:[@media(min-height:600px)]:flex">
      <Emblem className="h-[clamp(3rem,6.5vh,4.75rem)] w-[clamp(2.75rem,5.9vh,4.3rem)] drop-shadow-[0_0_20px_rgb(212_167_44/0.55)]" />
      <div className="leading-tight">
        <p className="text-[clamp(0.85rem,1.25vw,1.4rem)] font-black tracking-[0.2em] text-white">FERTILIZER PREMIER LEAGUE</p>
        <span className="mt-2 inline-flex rounded-full border border-gold/60 bg-gold/10 px-3 py-0.5 text-[clamp(0.6rem,0.8vw,0.9rem)] font-bold tracking-[0.3em] text-gold-light">
          {site.seasonUpper}
        </span>
      </div>
    </div>
  );
}

function PlayerName({ name, large }: { name: string; large: boolean }) {
  const { boxRef, textRef } = useFitText<HTMLHeadingElement>(name, 26, large ? 230 : 200);
  return (
    <div ref={boxRef} className="flex h-[clamp(5rem,15dvh,9rem)] w-full flex-col justify-end wide:h-[min(27vh,18rem)]">
      <h1
        ref={textRef}
        className="text-[clamp(2rem,6vw,6rem)] leading-[0.92] font-black tracking-[-0.015em] text-balance text-white uppercase [overflow-wrap:normal] drop-shadow-[0_6px_30px_rgb(0_0_0/0.65)]"
      >
        {name}
      </h1>
    </div>
  );
}

function ChromeButton({
  label,
  icon,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "default" | "gold" | "quiet";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold tracking-wide backdrop-blur-md transition-[background-color,border-color,box-shadow,color] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:px-4 wide:h-[clamp(2.75rem,5vh,3.25rem)] [&_svg]:size-[1.1rem]",
        tone === "default" && "border-white/15 bg-[#0a1020]/60 text-white/90 hover:border-gold/60 hover:text-white hover:shadow-[0_0_24px_-4px_rgb(212_167_44/0.55)]",
        tone === "gold" && "border-gold/80 bg-[linear-gradient(135deg,rgb(245_217_138/0.25),rgb(212_167_44/0.12))] text-gold-light shadow-[0_0_24px_-6px_rgb(212_167_44/0.7)] hover:border-gold-light hover:bg-gold/25 hover:shadow-[0_0_32px_-4px_rgb(212_167_44/0.9)]",
        tone === "quiet" && "border-white/10 bg-transparent text-white/55 hover:text-white",
      )}
    >
      <span className={tone === "default" ? "text-gold" : undefined} aria-hidden="true">
        {icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function NavButton({
  direction,
  disabled,
  quiet,
  hidden,
  onClick,
}: {
  direction: "previous" | "next";
  disabled: boolean;
  quiet: boolean;
  hidden: boolean;
  onClick: () => void;
}) {
  const next = direction === "next";
  const Icon = next ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={next ? "Next player" : "Previous player"}
      className={cn(
        "group relative z-10 grid size-12 shrink-0 place-items-center rounded-full border border-gold/45 bg-[#0a1020]/55 text-gold-light backdrop-blur-md transition-[opacity,background-color,border-color,box-shadow,transform] duration-300 hover:border-gold hover:bg-gold/15 hover:shadow-[0_0_34px_-2px_rgb(212_167_44/0.75)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:pointer-events-none disabled:opacity-25",
        "wide:absolute wide:top-1/2 wide:size-[clamp(3.25rem,6.2vh,4.5rem)] wide:-translate-y-1/2",
        next ? "wide:right-[clamp(0.75rem,1.4vw,2rem)]" : "wide:left-[clamp(0.75rem,1.4vw,2rem)]",
        quiet && "border-white/20 bg-black/20 text-white/70",
        hidden && "opacity-0 disabled:opacity-0",
      )}
    >
      <Icon className={cn("size-6 transition-transform duration-300 wide:size-7", next ? "group-hover:translate-x-0.5" : "group-hover:-translate-x-0.5")} aria-hidden="true" />
    </button>
  );
}
