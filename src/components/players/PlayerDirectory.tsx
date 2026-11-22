"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PLAYER_ROLES, type PlayerStats, type PublicPlayer, type RoleFilter } from "@/types/player";
import { normalizeForSearch, roleMeta } from "@/lib/utils";
import { PlayerSearch } from "@/components/players/PlayerSearch";
import { PlayerFilters } from "@/components/players/PlayerFilters";
import { PlayerGrid } from "@/components/players/PlayerGrid";
import { PlayerPagination } from "@/components/players/PlayerPagination";
import { PlayerEmptyState } from "@/components/players/PlayerEmptyState";
import { DIRECTORY_URL_KEY, FROM_DIRECTORY_KEY } from "@/components/players/BackButton";

function store(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {}
}

function parseRole(raw: string | null): RoleFilter {
  const value = (raw ?? "").toUpperCase().replace(/-/g, " ");
  return (PLAYER_ROLES as readonly string[]).includes(value) ? (value as RoleFilter) : "ALL";
}

const roleCount = (stats: PlayerStats, role: RoleFilter) =>
  role === "ALL" ? stats.total : role === "BATSMAN" ? stats.batsmen : role === "BOWLER" ? stats.bowlers : stats.allRounders;

export function PlayerDirectory({
  players,
  stats,
  pageSize,
}: {
  players: PublicPlayer[];
  stats: PlayerStats;
  pageSize: number;
}) {
  // Read from the live URL (not server props) so Back restores search, role and page.
  const params = useSearchParams();
  const [query, setQuery] = useState(() => (params.get("q") ?? "").slice(0, 60));
  const [role, setRole] = useState<RoleFilter>(() => parseRole(params.get("role")));
  const [page, setPage] = useState(() => Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const [interacted, setInteracted] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const topRef = useRef<HTMLDivElement>(null);

  const searchIndex = useMemo(() => players.map((p) => normalizeForSearch(p.name)), [players]);

  const filtered = useMemo(() => {
    const q = normalizeForSearch(deferredQuery);
    return players.filter((p, i) => (role === "ALL" || p.role === role) && (!q || searchIndex[i]!.includes(q)));
  }, [players, searchIndex, deferredQuery, role]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages); // clamp after search/filter changes
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const roleLabel = role === "ALL" ? "Players" : roleMeta[role].plural;
  const trimmedQuery = deferredQuery.trim();

  useEffect(() => store(FROM_DIRECTORY_KEY, null), []);

  // Keep the URL shareable without triggering a server round trip.
  useEffect(() => {
    if (!interacted) {
      store(DIRECTORY_URL_KEY, window.location.pathname + window.location.search);
      return;
    }
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (role !== "ALL") next.set("role", role.toLowerCase().replace(" ", "-"));
    if (currentPage > 1) next.set("page", String(currentPage));
    const search = next.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
    store(DIRECTORY_URL_KEY, url);
  }, [interacted, query, role, currentPage]);

  const touch = () => setInteracted(true);

  const changePage = (next: number) => {
    touch();
    setPage(Math.min(Math.max(1, next), totalPages));
    const el = topRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  const reset = () => {
    touch();
    setQuery("");
    setRole("ALL");
    setPage(1);
  };

  let body;
  if (players.length === 0) {
    body = <PlayerEmptyState variant="no-players" />;
  } else if (filtered.length === 0) {
    body =
      !trimmedQuery && roleCount(stats, role) === 0 ? (
        <PlayerEmptyState variant="empty-category" roleLabel={roleLabel} onReset={reset} />
      ) : (
        <PlayerEmptyState variant="no-results" query={trimmedQuery} roleLabel={role === "ALL" ? undefined : roleLabel} onReset={reset} />
      );
  } else {
    const from = (currentPage - 1) * pageSize + 1;
    const to = from + visible.length - 1;
    body = (
      <>
        <div className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
          <p className="text-sm text-muted" aria-live="polite">
            <span className="font-bold text-ink tabular-nums">{filtered.length}</span> {filtered.length === 1 ? roleLabel.replace(/s$/, "") : roleLabel}
            {trimmedQuery && (
              <>
                {" "}
                matching <span className="font-semibold text-ink">“{trimmedQuery}”</span>
              </>
            )}
          </p>
          <p className="shrink-0 text-xs text-muted tabular-nums">
            {from}–{to}
          </p>
        </div>
        <PlayerGrid
          key={`${role}|${currentPage}|${normalizeForSearch(deferredQuery)}`}
          players={visible}
          animate={interacted}
          priorityCount={interacted ? 0 : 4}
        />
        <PlayerPagination page={currentPage} totalPages={totalPages} onChange={changePage} />
      </>
    );
  }

  return (
    <div
      ref={topRef}
      className="scroll-mt-20"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('a[href^="/players/"]')) store(FROM_DIRECTORY_KEY, "1");
      }}
    >
      <div className="space-y-2.5 sm:space-y-3">
        <PlayerSearch
          value={query}
          onChange={(v) => {
            touch();
            setQuery(v);
            setPage(1);
          }}
        />
        <PlayerFilters
          value={role}
          stats={stats}
          onChange={(r) => {
            touch();
            setRole(r);
            setPage(1);
          }}
        />
      </div>

      <div className="mt-6 sm:mt-8" aria-busy={query !== deferredQuery}>
        {body}
      </div>
    </div>
  );
}
