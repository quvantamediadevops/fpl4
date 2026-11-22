"use client";

import { m } from "motion/react";
import type { PlayerStats, RoleFilter } from "@/types/player";
import { cn } from "@/lib/utils";

const filters: { value: RoleFilter; label: string; count: (s: PlayerStats) => number; dot: string }[] = [
  { value: "ALL", label: "All Players", count: (s) => s.total, dot: "bg-gold" },
  { value: "BATSMAN", label: "Batsman", count: (s) => s.batsmen, dot: "bg-bat" },
  { value: "BOWLER", label: "Bowler", count: (s) => s.bowlers, dot: "bg-bowl" },
  { value: "ALL ROUNDER", label: "All Rounder", count: (s) => s.allRounders, dot: "bg-ar" },
];

/**
 * 2 × 2 on phones (every option visible, nothing clipped, no hidden scrolling),
 * a single row from 640px up.
 */
export function PlayerFilters({
  value,
  stats,
  onChange,
}: {
  value: RoleFilter;
  stats: PlayerStats;
  onChange: (value: RoleFilter) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Filter by playing role" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {filters.map((f) => {
        const active = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(f.value)}
            className={cn(
              "relative inline-flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-[color,box-shadow,transform] active:scale-[0.97] sm:justify-start sm:rounded-full sm:px-4",
              active ? "text-ink" : "bg-white text-ink/80 shadow-card ring-1 ring-line hover:text-ink hover:ring-ink/20",
            )}
          >
            {active && (
              <m.span
                layoutId="role-filter-pill"
                className="absolute inset-0 rounded-xl bg-gold shadow-[0_8px_18px_-10px_rgb(212_167_44/0.9)] sm:rounded-full"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative flex min-w-0 items-center gap-2">
              {!active && <span className={cn("size-1.5 shrink-0 rounded-full", f.dot)} aria-hidden="true" />}
              <span className="truncate">{f.label}</span>
            </span>
            <span
              className={cn(
                "relative shrink-0 rounded-md px-1.5 py-px text-[11px] font-bold tabular-nums",
                active ? "bg-ink/10 text-ink" : "bg-mist text-muted",
              )}
            >
              {f.count(stats)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
