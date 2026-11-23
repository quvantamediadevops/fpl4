"use client";

import { m } from "motion/react";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn, normalizeForSearch } from "@/lib/utils";
import { PLAYER_ROLES, type PublicPlayer, type RoleFilter } from "@/types/player";
import { PlayerThumb, ROLE_DISPLAY, padPosition, useDialog } from "./shared";

const FILTER_LABEL: Record<RoleFilter, string> = {
  ALL: "All",
  BATSMAN: "Batsmen",
  BOWLER: "Bowlers",
  "ALL ROUNDER": "All-Rounders",
};

export function PresentationPlayerList({
  players,
  currentIndex,
  onSelect,
  onClose,
}: {
  players: PublicPlayer[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useDialog(panelRef, onClose);

  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("ALL");
  const names = useMemo(() => players.map((p) => normalizeForSearch(p.name)), [players]);

  const counts = useMemo(() => {
    const c: Record<RoleFilter, number> = { ALL: players.length, BATSMAN: 0, BOWLER: 0, "ALL ROUNDER": 0 };
    for (const p of players) if (p.role) c[p.role] += 1;
    return c;
  }, [players]);

  const visible = useMemo(() => {
    const q = normalizeForSearch(query);
    const out: number[] = [];
    players.forEach((p, i) => {
      if ((role === "ALL" || p.role === role) && (!q || names[i]?.includes(q))) out.push(i);
    });
    return out;
  }, [players, names, query, role]);

  // Open on the player currently presented.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <m.div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-list-title"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-gold/25 bg-[#080c17]/97 text-white shadow-[-30px_0_80px_-20px_rgb(0_0_0/0.8)] outline-none sm:w-[26rem] xl:w-[28rem]"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 id="player-list-title" className="text-sm font-extrabold tracking-[0.28em] text-gold-light">
            PLAYER LIST <span className="text-white/40">· {players.length}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player list"
            className="grid size-10 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-gold"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 border-b border-white/10 px-5 pt-4 pb-4">
          <label className="flex h-12 items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-4 focus-within:border-gold/60">
            <Search className="size-4 shrink-0 text-gold" aria-hidden="true" />
            <input
              data-autofocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players"
              aria-label="Search players"
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-white/35 [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Filter by role">
            {(["ALL", ...PLAYER_ROLES] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-gold",
                  role === r ? "border-gold bg-gold text-[#111827]" : "border-white/15 text-white/75 hover:border-gold/50 hover:text-white",
                )}
              >
                {FILTER_LABEL[r]}
                <span className={cn("tabular-nums", role === r ? "text-[#111827]/70" : "text-white/40")}>{counts[r]}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length > 0 ? (
          <ul ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Players">
            {visible.map((index) => {
              const player = players[index];
              if (!player) return null;
              const current = index === currentIndex;
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    onClick={() => onSelect(index)}
                    className={cn(
                      "flex w-full items-center gap-3.5 rounded-2xl px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold",
                      current ? "bg-gold/15 ring-1 ring-gold/50" : "hover:bg-white/5",
                    )}
                  >
                    <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums text-white/35">
                      {padPosition(index + 1, players.length)}
                    </span>
                    <PlayerThumb player={player} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold uppercase tracking-wide">{player.name}</span>
                      <span className="mt-0.5 block text-[11px] font-semibold tracking-[0.16em] text-gold-light/75">
                        {player.role ? ROLE_DISPLAY[player.role] : "ROLE NOT LISTED"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex-1 px-6 py-12 text-center text-sm text-white/50" role="status">
            No players match this search.
          </p>
        )}
      </m.div>
    </m.div>
  );
}
