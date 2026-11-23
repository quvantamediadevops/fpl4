"use client";

import { m } from "motion/react";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn, normalizeForSearch } from "@/lib/utils";
import type { PublicPlayer } from "@/types/player";
import { PlayerThumb, ROLE_DISPLAY, padPosition, useDialog } from "./shared";

const MAX_RESULTS = 40;

export function PresentationSearch({
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
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, onClose);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const names = useMemo(() => players.map((p) => normalizeForSearch(p.name)), [players]);

  const results = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return [];
    const out: number[] = [];
    for (let i = 0; i < names.length && out.length < MAX_RESULTS; i++) {
      if (names[i]?.includes(q)) out.push(i);
    }
    return out;
  }, [names, query]);

  useEffect(() => {
    document.getElementById(`search-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (k: number) => {
    const index = results[k];
    if (index !== undefined) onSelect(index);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    }
  };

  const hasQuery = normalizeForSearch(query) !== "";

  return (
    <m.div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 px-4 pt-[10vh] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <m.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search player"
        tabIndex={-1}
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-gold/30 bg-[#0a0f1c]/95 text-white shadow-[0_40px_120px_-20px_rgb(0_0_0/0.9)] outline-none"
        initial={{ y: -16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -10, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5">
          <Search className="size-5 shrink-0 text-gold" aria-hidden="true" />
          <input
            data-autofocus
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search player by name"
            aria-label="Player name"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={results.length > 0 ? `search-option-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-16 min-w-0 flex-1 bg-transparent text-lg font-medium text-white outline-none placeholder:text-white/35 [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="grid size-10 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-gold"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {results.length > 0 ? (
          <ul id="search-results" role="listbox" aria-label="Matching players" className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain p-2">
            {results.map((index, k) => {
              const player = players[index];
              if (!player) return null;
              return (
                <li
                  key={player.id}
                  id={`search-option-${k}`}
                  role="option"
                  aria-selected={k === active}
                  onPointerMove={() => setActive(k)}
                  onClick={() => choose(k)}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors",
                    k === active ? "bg-gold/15" : "hover:bg-white/5",
                  )}
                >
                  <PlayerThumb player={player} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold uppercase tracking-wide">{player.name}</span>
                    <span className="mt-0.5 block text-xs font-semibold tracking-[0.18em] text-gold-light/80">
                      {player.role ? ROLE_DISPLAY[player.role] : "ROLE NOT LISTED"}
                    </span>
                  </span>
                  {index === currentIndex ? (
                    <span className="rounded-full border border-gold/50 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-gold-light">ON SCREEN</span>
                  ) : (
                    <span className="text-xs font-semibold tabular-nums text-white/35">{padPosition(index + 1, players.length)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-white/50" role="status">
            {hasQuery ? <>No player matches “{query.trim()}”.</> : "Type a name, then press Enter to present the highlighted player."}
          </p>
        )}
      </m.div>
    </m.div>
  );
}
