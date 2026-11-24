"use client";

import { AnimatePresence } from "motion/react";
import { Download, ExternalLink, Gavel, LogOut, Pause, Play, Printer, RefreshCw, Search, Trophy, Undo2, UserX, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkSale, describeRejection, teamPosition } from "@/auction/rules";
import type { AuctionAdminDetail, AuctionPlayerView, AuctionSnapshot, AuctionTeamView, CommandResult } from "@/auction/types";
import { Emblem } from "@/components/layout/Logo";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { cn, normalizeForSearch } from "@/lib/utils";
import { ConnectionPill, StatusPill, TeamLogo, inr, roleText } from "./bits";
import { Modal } from "./Modal";
import { TeamBudgetCard } from "./TeamBudgetCard";
import { useAuctionLive } from "./useAuctionLive";

type Notice = { kind: "ok" | "error"; text: string } | null;
type Dialog =
  | { kind: "sell"; player: AuctionPlayerView; team: AuctionTeamView; price: number; key: string }
  | { kind: "unsold"; player: AuctionPlayerView }
  | { kind: "reverse"; saleId: string; playerName: string; teamName: string; price: number }
  | { kind: "status"; action: "start" | "pause" | "resume" | "complete" | "loadPool" }
  | null;

const STATUS_FILTERS = ["ALL", "AVAILABLE", "UNSOLD", "SOLD"] as const;

export function ControlRoom({ initial, adminId, csrf }: { initial: AuctionSnapshot; adminId: string; csrf: string }) {
  const { snapshot, connection, apply } = useAuctionLive(initial);
  const s = snapshot ?? initial;
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [detail, setDetail] = useState<AuctionAdminDetail | null>(null);
  const [sessionLost, setSessionLost] = useState(false);

  const players = useMemo(() => new Map(s.players.map((p) => [p.id, p])), [s.players]);
  const teams = useMemo(() => new Map(s.teams.map((t) => [t.id, t])), [s.teams]);
  const current = s.currentPlayerId ? players.get(s.currentPlayerId) ?? null : null;

  const send = useCallback(
    async (body: Record<string, unknown>, success?: string): Promise<CommandResult | null> => {
      setBusy(true);
      try {
        const res = await fetch("/api/auction/admin/command", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify(body),
        });
        if (res.status === 401) {
          setSessionLost(true);
          return null;
        }
        const data = (await res.json()) as CommandResult;
        if (data.snapshot) apply(data.snapshot);
        setNotice(data.ok ? (success ? { kind: "ok", text: data.duplicate ? `${success} (already recorded)` : success } : null) : { kind: "error", text: data.message });
        return data;
      } catch {
        setNotice({ kind: "error", text: "Network error — the action may not have reached the server. Check the live status before retrying." });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [apply, csrf],
  );

  // Admin-only audit detail, refreshed whenever the auction changes.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auction/admin/detail", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AuctionAdminDetail>) : null))
      .then((d) => {
        if (!cancelled && d) setDetail(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [s.version]);

  async function logout() {
    await fetch("/api/auction/admin/logout", { method: "POST" }).catch(() => {});
    window.location.reload();
  }

  const active = s.status === "ACTIVE";

  return (
    <div data-standalone className="min-h-dvh bg-[#060a14] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060a14]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <Emblem className="h-10 w-9" />
            <div className="leading-tight">
              <p className="text-[11px] font-extrabold tracking-[0.18em] text-white/70">FPL SEASON 4</p>
              <h1 className="text-base font-black tracking-[0.16em] text-gold-light">AUCTION CONTROL ROOM</h1>
            </div>
          </div>
          <StatusPill status={s.status} />
          <ConnectionPill connection={connection} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <StatusControls status={s.status} busy={busy} onAction={(action) => setDialog({ kind: "status", action })} />
            <a href="/auction/presenter" target="_blank" rel="noopener" className="btn-ghost">
              <ExternalLink className="size-4" aria-hidden="true" /> Presenter
            </a>
            <span className="hidden text-xs text-white/50 md:inline">
              Signed in as <b className="text-white/80">{adminId}</b>
            </span>
            <button type="button" onClick={logout} className="btn-ghost" aria-label="Log out">
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] space-y-5 px-4 py-5 lg:px-6">
        {sessionLost && (
          <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">
            Your session has ended. <button className="font-bold underline" onClick={() => window.location.reload()}>Sign in again</button> — nothing after this point was saved.
          </p>
        )}
        <div aria-live="polite" className="min-h-0">
          {notice && (
            <p className={cn("flex items-start justify-between gap-4 rounded-xl px-4 py-3 text-sm font-semibold", notice.kind === "ok" ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border border-red-400/40 bg-red-500/15 text-red-100")}>
              {notice.text}
              <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </p>
          )}
        </div>

        <Stats s={s} />

        {s.status === "NOT_STARTED" && <SetupPanel s={s} busy={busy} onLoad={() => setDialog({ kind: "status", action: "loadPool" })} />}
        {s.status === "PAUSED" && <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">Auction paused — selecting players and sales are disabled until you resume.</p>}
        {s.status === "COMPLETED" && <p className="rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold-light">Auction completed. Download the final report below.</p>}

        <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <PlayerSelector s={s} teams={teams} disabled={!active || busy} onSelect={(id) => send({ type: "select", playerId: id }, "Player sent to the presenter screen.")} />
          <SalePanel
            s={s}
            current={current}
            teams={teams}
            disabled={!active || busy}
            onSell={(team, price) => current && setDialog({ kind: "sell", player: current, team, price, key: crypto.randomUUID() })}
            onUnsold={() => current && setDialog({ kind: "unsold", player: current })}
            onNext={() => {
              const next = s.players.find((p) => p.status === "AVAILABLE") ?? s.players.find((p) => p.status === "UNSOLD");
              if (next) void send({ type: "select", playerId: next.id }, "Next player sent to the presenter screen.");
            }}
          />
        </div>

        <section aria-labelledby="teams-heading">
          <h2 id="teams-heading" className="section-title">TEAM BUDGETS</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {s.teams.map((t) => (
              <TeamBudgetCard key={t.id} team={t} playersPerTeam={s.rules.playersPerTeam} />
            ))}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <SalesLedger
            detail={detail}
            players={players}
            teams={teams}
            canCorrect={(s.status === "ACTIVE" || s.status === "PAUSED") && !busy}
            onReverse={(sale) =>
              setDialog({ kind: "reverse", saleId: sale.saleId, playerName: players.get(sale.playerId)?.name ?? sale.playerId, teamName: teams.get(sale.teamId)?.name ?? sale.teamId, price: sale.price })
            }
          />
          <ActivityLog detail={detail} players={players} teams={teams} />
        </div>

        <section aria-labelledby="reports-heading" className="rounded-2xl border border-white/10 bg-[#0b1222]/80 p-4">
          <h2 id="reports-heading" className="section-title">REPORTS {s.status !== "COMPLETED" && <span className="text-white/40">· PROVISIONAL UNTIL COMPLETED</span>}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/auction/admin/report" className="btn-ghost">
              <Download className="size-4" aria-hidden="true" /> Download CSV
            </a>
            <a href="/auction/admin/report" target="_blank" rel="noopener" className="btn-ghost">
              <Printer className="size-4" aria-hidden="true" /> Printable team report
            </a>
            <a href="/auction/teams" target="_blank" rel="noopener" className="btn-ghost">
              <Users className="size-4" aria-hidden="true" /> Public team overview
            </a>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {dialog && (
          <ConfirmDialog
            key={dialog.kind}
            dialog={dialog}
            s={s}
            busy={busy}
            onClose={() => setDialog(null)}
            onConfirm={async (extra) => {
              if (!dialog) return;
              let result: CommandResult | null = null;
              if (dialog.kind === "sell") {
                result = await send(
                  { type: "sell", playerId: dialog.player.id, teamId: dialog.team.id, price: dialog.price, idempotencyKey: dialog.key },
                  `SOLD: ${dialog.player.name} to ${dialog.team.name} for ${inr(dialog.price)}.`,
                );
              } else if (dialog.kind === "unsold") {
                result = await send({ type: "unsold", playerId: dialog.player.id }, `${dialog.player.name} marked UNSOLD. They stay eligible for a later round.`);
              } else if (dialog.kind === "reverse") {
                result = await send({ type: "reverse", saleId: dialog.saleId, reason: extra ?? "" }, `Sale reversed: ${dialog.playerName}. Budget and slot restored.`);
              } else {
                const labels = { start: "Auction started.", pause: "Auction paused.", resume: "Auction resumed.", complete: "Auction completed.", loadPool: "Player pool loaded from registrations." };
                result = await send({ type: dialog.action }, labels[dialog.action]);
              }
              if (result?.ok || dialog.kind !== "reverse") setDialog(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusControls({ status, busy, onAction }: { status: AuctionSnapshot["status"]; busy: boolean; onAction: (a: "start" | "pause" | "resume" | "complete") => void }) {
  return (
    <>
      {status === "NOT_STARTED" && (
        <button type="button" disabled={busy} onClick={() => onAction("start")} className="btn-gold">
          <Play className="size-4" aria-hidden="true" /> Start auction
        </button>
      )}
      {status === "ACTIVE" && (
        <button type="button" disabled={busy} onClick={() => onAction("pause")} className="btn-ghost">
          <Pause className="size-4" aria-hidden="true" /> Pause
        </button>
      )}
      {status === "PAUSED" && (
        <button type="button" disabled={busy} onClick={() => onAction("resume")} className="btn-gold">
          <Play className="size-4" aria-hidden="true" /> Resume
        </button>
      )}
      {(status === "ACTIVE" || status === "PAUSED") && (
        <button type="button" disabled={busy} onClick={() => onAction("complete")} className="btn-ghost">
          <Trophy className="size-4" aria-hidden="true" /> Complete
        </button>
      )}
    </>
  );
}

function Stats({ s }: { s: AuctionSnapshot }) {
  const items: [string, string][] = [
    ["TOTAL PLAYERS", String(s.counts.pool)],
    ["SOLD", String(s.counts.sold)],
    ["AVAILABLE", String(s.counts.available)],
    ["UNSOLD", String(s.counts.unsold)],
    ["SLOTS FILLED", `${s.counts.filledSlots} / ${s.counts.totalSlots}`],
    ["TOTAL SPENT", inr(s.counts.spent)],
    ["BUDGET LEFT", inr(s.counts.combinedRemaining)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-[#0b1222]/80 px-4 py-3">
          <dt className="text-[10px] font-bold tracking-[0.18em] text-white/45">{label}</dt>
          <dd className="mt-1 text-2xl font-black tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SetupPanel({ s, busy, onLoad }: { s: AuctionSnapshot; busy: boolean; onLoad: () => void }) {
  const needed = s.teams.length * s.rules.playersPerTeam;
  return (
    <section className="rounded-2xl border border-gold/30 bg-gold/[0.06] p-4">
      <h2 className="section-title">SET UP</h2>
      <p className="mt-2 text-sm text-white/75">
        Rules from the database: {s.teams.length} teams · {s.rules.playersPerTeam} auction players each + 1 pre-assigned icon · budget {inr(s.rules.teamBudget)} · any whole-rupee price from {inr(s.rules.minimumBid)} to {inr(s.rules.maximumBid)}.
      </p>
      <p className="mt-1 text-sm text-white/75">
        Pool: <b className={s.counts.pool === needed ? "text-emerald-300" : "text-amber-300"}>{s.counts.pool}</b> of {needed} needed. Loading copies the current registrations (name, type, photo) and locks them when the auction starts.
      </p>
      <button type="button" disabled={busy} onClick={onLoad} className="btn-gold mt-3">
        <RefreshCw className="size-4" aria-hidden="true" /> {s.counts.pool ? "Reload pool from registrations" : "Load pool from registrations"}
      </button>
      <h3 className="mt-5 text-[11px] font-bold tracking-[0.2em] text-white/50">ICON PLAYERS (READ-ONLY)</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {s.teams.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
            <TeamLogo team={t} className="size-7 text-xs" />
            <span className="font-bold">{t.name}</span>
            <span className="ml-auto truncate text-gold-light">{t.icon?.name ?? "—"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlayerSelector({ s, teams, disabled, onSelect }: { s: AuctionSnapshot; teams: Map<string, AuctionTeamView>; disabled: boolean; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("AVAILABLE");
  const list = useMemo(() => {
    const q = normalizeForSearch(query);
    return s.players.filter((p) => (filter === "ALL" || p.status === filter) && (!q || normalizeForSearch(p.name).includes(q)));
  }, [s.players, query, filter]);
  const counts = { ALL: s.players.length, AVAILABLE: s.counts.available, UNSOLD: s.counts.unsold, SOLD: s.counts.sold };

  return (
    <section aria-labelledby="selector-heading" className="flex max-h-[760px] flex-col rounded-2xl border border-white/10 bg-[#0b1222]/80">
      <div className="space-y-3 border-b border-white/10 p-4">
        <h2 id="selector-heading" className="section-title">SELECT PLAYER</h2>
        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 focus-within:border-gold">
          <Search className="size-4 text-gold" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" aria-label="Search players" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div className="flex gap-1.5" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide", filter === f ? "border-gold bg-gold text-[#111827]" : "border-white/15 text-white/70 hover:border-gold/50")}
            >
              {f} <span className="opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto p-2" aria-label="Players">
        {list.length === 0 && <li className="p-6 text-center text-sm text-white/40">No players match.</li>}
        {list.map((p) => {
          const selectable = p.status !== "SOLD";
          const current = p.id === s.currentPlayerId;
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={!selectable || disabled || current}
                onClick={() => onSelect(p.id)}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors disabled:cursor-default",
                  current ? "bg-gold/15 ring-1 ring-gold/50" : selectable && !disabled ? "hover:bg-white/5" : "",
                )}
              >
                <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-[#0b1220] ring-1 ring-white/10">
                  <PlayerPhoto src={p.photo} name={p.name} sizes="48px" stage />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold uppercase">{p.name}</span>
                  <span className="block text-[10px] font-bold tracking-[0.14em] text-gold-light/70">{roleText(p.role)}</span>
                </span>
                <PlayerStatus p={p} team={p.teamId ? teams.get(p.teamId) : undefined} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlayerStatus({ p, team }: { p: AuctionPlayerView; team?: AuctionTeamView }) {
  if (p.status === "SOLD") return <span className="text-right text-[10px] font-bold leading-tight text-white/50">{team?.name ?? "SOLD"}<br />{inr(p.price ?? 0)}</span>;
  if (p.status === "UNSOLD") return <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">UNSOLD{p.unsoldCount > 1 ? ` ×${p.unsoldCount}` : ""}</span>;
  return <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">AVAILABLE</span>;
}

function SalePanel({
  s,
  current,
  teams,
  disabled,
  onSell,
  onUnsold,
  onNext,
}: {
  s: AuctionSnapshot;
  current: AuctionPlayerView | null;
  teams: Map<string, AuctionTeamView>;
  disabled: boolean;
  onSell: (team: AuctionTeamView, price: number) => void;
  onUnsold: () => void;
  onNext: () => void;
}) {
  if (!current) {
    return (
      <section className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-white/15 bg-[#0b1222]/60 p-8 text-center">
        <div>
          <Gavel className="mx-auto size-10 text-gold/70" aria-hidden="true" />
          <p className="mt-4 text-lg font-bold">No player on the presenter screen</p>
          <p className="mt-1 text-sm text-white/55">Pick a player from the list, or send the next available one.</p>
          <button type="button" disabled={disabled} onClick={onNext} className="btn-gold mt-5">
            Next available player
          </button>
        </div>
      </section>
    );
  }

  const soldTeam = current.teamId ? teams.get(current.teamId) : undefined;

  return (
    <section aria-labelledby="sale-heading" className="grid gap-5 rounded-2xl border border-white/10 bg-[#0b1222]/80 p-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div>
        <h2 id="sale-heading" className="section-title">ON THE PRESENTER NOW</h2>
        <div className="relative mt-3 aspect-[4/5] overflow-hidden rounded-2xl bg-[#0b1220] ring-2 ring-gold/60">
          <PlayerPhoto src={current.photo} name={current.name} sizes="300px" stage />
        </div>
        <p className="mt-3 text-2xl font-black uppercase leading-tight">{current.name}</p>
        <p className="mt-1 flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-gold-light">
          {roleText(current.role)} <PlayerStatus p={current} team={soldTeam} />
        </p>
        <button type="button" disabled={disabled} onClick={onNext} className="btn-ghost mt-4 w-full justify-center">
          Next available player
        </button>
      </div>

      {current.status === "SOLD" ? (
        <div className="grid place-items-center rounded-2xl bg-gold/10 p-6 text-center">
          <div>
            <p className="text-sm font-extrabold tracking-[0.3em] text-gold-light">SOLD</p>
            {soldTeam && <TeamLogo team={soldTeam} className="mx-auto mt-3 size-16 text-lg" />}
            <p className="mt-3 text-2xl font-black">{soldTeam?.name}</p>
            <p className="mt-1 text-4xl font-black tabular-nums text-gold-light">{inr(current.price ?? 0)}</p>
            <p className="mt-4 text-sm text-white/55">Select the next player when the presenter is ready.</p>
          </div>
        </div>
      ) : (
        // Keyed by player: a fresh form (no team, minimum price) for every player.
        <SaleForm key={current.id} s={s} current={current} teams={teams} disabled={disabled} onSell={onSell} onUnsold={onUnsold} />
      )}
    </section>
  );
}

function SaleForm({
  s,
  current,
  teams,
  disabled,
  onSell,
  onUnsold,
}: {
  s: AuctionSnapshot;
  current: AuctionPlayerView;
  teams: Map<string, AuctionTeamView>;
  disabled: boolean;
  onSell: (team: AuctionTeamView, price: number) => void;
  onUnsold: () => void;
}) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [price, setPrice] = useState<number>(s.rules.minimumBid);
  const team = teamId ? teams.get(teamId) ?? null : null;
  const pos = team ? teamPosition(s.rules, { initialBudget: team.initialBudget, spent: team.spent, purchased: team.purchased }) : null;
  const rejection = team
    ? checkSale({
        rules: s.rules,
        status: s.status,
        currentPlayerId: s.currentPlayerId,
        player: { id: current.id, status: current.status },
        team: { initialBudget: team.initialBudget, spent: team.spent, purchased: team.purchased },
        price,
      })
    : null;

  return (
    <div className="flex flex-col">
      <fieldset disabled={disabled}>
        <legend className="text-[11px] font-bold tracking-[0.2em] text-white/50">WINNING TEAM</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Winning team">
          {s.teams.map((t) => {
            const full = t.slotsLeft === 0;
            const selected = t.id === teamId;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={full}
                onClick={() => setTeamId(t.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors disabled:opacity-35",
                  selected ? "border-gold bg-gold/15" : "border-white/10 bg-white/[0.03] hover:border-gold/50",
                )}
              >
                <TeamLogo team={t} className="size-9 text-xs" />
                <span className="w-full truncate text-xs font-black">{t.name}</span>
                <span className="text-[10px] font-semibold tabular-nums text-white/55">{full ? "FULL" : `${inr(t.remaining)} · ${t.slotsLeft} left`}</span>
              </button>
            );
          })}
        </div>

        <label htmlFor="sale-price" className="mt-5 block text-[11px] font-bold tracking-[0.2em] text-white/50">
          FINAL SALE PRICE (₹{s.rules.minimumBid.toLocaleString("en-IN")} – ₹{s.rules.maximumBid.toLocaleString("en-IN")}, ANY WHOLE RUPEE)
        </label>
        <div className="mt-2 flex items-center rounded-xl border border-white/15 bg-white/5 focus-within:border-gold">
          <span className="pl-4 text-3xl font-black text-gold-light" aria-hidden="true">
            ₹
          </span>
          <input
            id="sale-price"
            type="number"
            inputMode="numeric"
            min={s.rules.minimumBid}
            max={pos?.canBuy ? pos.maxNextPrice : s.rules.maximumBid}
            step={1}
            value={Number.isFinite(price) ? price : ""}
            onChange={(e) => setPrice(e.target.value === "" ? Number.NaN : Number(e.target.value))}
            className="h-14 w-full min-w-0 bg-transparent px-2 text-3xl font-black tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      </fieldset>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Info label="REMAINING BUDGET" value={pos ? inr(pos.remaining) : "—"} />
        <Info label="SLOTS LEFT" value={pos ? `${pos.slotsLeft} of ${s.rules.playersPerTeam}` : "—"} />
        <Info label="RESERVE AFTER SALE" value={pos ? inr(Math.max(0, pos.slotsLeft - 1) * s.rules.minimumBid) : "—"} />
        <Info label="MAX PERMITTED" value={pos ? (pos.canBuy ? inr(pos.maxNextPrice) : "—") : "—"} highlight />
      </dl>

      <p className={cn("mt-3 min-h-5 text-sm font-semibold", rejection ? "text-red-300" : "text-emerald-300")} aria-live="polite">
        {!team ? "Choose the winning team." : rejection ? describeRejection(rejection, s.rules, pos ?? undefined) : `Ready: ${team.name} will have ${inr((pos?.remaining ?? 0) - price)} left.`}
      </p>

      <div className="mt-auto flex flex-wrap gap-3 pt-4">
        <button type="button" disabled={disabled || !team || !!rejection} onClick={() => team && onSell(team, price)} className="btn-gold h-14 flex-1 justify-center text-lg">
          <Gavel className="size-5" aria-hidden="true" /> CONFIRM SOLD
        </button>
        <button type="button" disabled={disabled} onClick={onUnsold} className="btn-ghost h-14 justify-center">
          <UserX className="size-5" aria-hidden="true" /> Mark unsold
        </button>
      </div>
    </div>
  );
}

function Info({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl px-3 py-2", highlight ? "bg-gold/15" : "bg-white/[0.04]")}>
      <dt className="text-[9px] font-bold tracking-[0.16em] text-white/45">{label}</dt>
      <dd className={cn("mt-0.5 text-lg font-black tabular-nums", highlight && "text-gold-light")}>{value}</dd>
    </div>
  );
}

function SalesLedger({
  detail,
  players,
  teams,
  canCorrect,
  onReverse,
}: {
  detail: AuctionAdminDetail | null;
  players: Map<string, AuctionPlayerView>;
  teams: Map<string, AuctionTeamView>;
  canCorrect: boolean;
  onReverse: (sale: AuctionAdminDetail["sales"][number]) => void;
}) {
  return (
    <section aria-labelledby="ledger-heading" className="rounded-2xl border border-white/10 bg-[#0b1222]/80 p-4">
      <h2 id="ledger-heading" className="section-title">SALES LEDGER</h2>
      <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1 text-sm">
        {!detail?.sales.length && <li className="text-white/40">No sales yet.</li>}
        {detail?.sales.map((sale) => (
          <li key={sale.saleId} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", sale.reversedAt ? "bg-white/[0.02] text-white/40" : "bg-white/[0.04]")}>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate font-bold uppercase", sale.reversedAt && "line-through")}>{players.get(sale.playerId)?.name ?? sale.playerId}</span>
              <span className="block truncate text-[11px] text-white/50">
                {teams.get(sale.teamId)?.name} · {new Date(sale.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })} · by {sale.adminId}
                {sale.reversedAt && ` · REVERSED by ${sale.reversedBy}: ${sale.reversalReason}`}
              </span>
            </span>
            <span className="font-black tabular-nums">{inr(sale.price)}</span>
            {!sale.reversedAt && (
              <button type="button" disabled={!canCorrect} onClick={() => onReverse(sale)} className="btn-ghost h-8 px-2.5 text-xs">
                <Undo2 className="size-3.5" aria-hidden="true" /> Correct
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const EVENT_TEXT: Record<string, string> = {
  POOL_LOADED: "Pool loaded",
  AUCTION_STARTED: "Auction started",
  AUCTION_PAUSED: "Auction paused",
  AUCTION_RESUMED: "Auction resumed",
  AUCTION_COMPLETED: "Auction completed",
  PLAYER_SELECTED: "Selected",
  PLAYER_SOLD: "Sold",
  PLAYER_UNSOLD: "Unsold",
  SALE_REVERSED: "Sale reversed",
};

function ActivityLog({ detail, players, teams }: { detail: AuctionAdminDetail | null; players: Map<string, AuctionPlayerView>; teams: Map<string, AuctionTeamView> }) {
  return (
    <section aria-labelledby="log-heading" className="rounded-2xl border border-white/10 bg-[#0b1222]/80 p-4">
      <h2 id="log-heading" className="section-title">AUDIT LOG</h2>
      <ol className="mt-3 max-h-[420px] space-y-1 overflow-y-auto pr-1 text-sm">
        {!detail?.events.length && <li className="text-white/40">No activity yet.</li>}
        {detail?.events.map((e) => (
          <li key={e.id} className="flex gap-3 border-b border-white/5 py-1.5">
            <span className="w-16 shrink-0 tabular-nums text-white/40">{new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
            <span className="min-w-0 flex-1">
              <b className={cn(e.type === "PLAYER_SOLD" && "text-emerald-300", e.type === "SALE_REVERSED" && "text-red-300", e.type === "PLAYER_UNSOLD" && "text-amber-200")}>{EVENT_TEXT[e.type] ?? e.type}</b>
              {e.playerId && <span className="uppercase"> · {players.get(e.playerId)?.name ?? e.playerId}</span>}
              {e.teamId && <span> · {teams.get(e.teamId)?.name ?? e.teamId}</span>}
              {e.amount != null && <span className="tabular-nums"> · {inr(e.amount)}</span>}
              {typeof e.metadata?.reason === "string" && <span className="text-white/50"> · “{e.metadata.reason}”</span>}
            </span>
            <span className="shrink-0 text-xs text-white/35">{e.adminId}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConfirmDialog({ dialog, s, busy, onClose, onConfirm }: { dialog: NonNullable<Dialog>; s: AuctionSnapshot; busy: boolean; onClose: () => void; onConfirm: (extra?: string) => void }) {
  const [reason, setReason] = useState("");
  const submitting = useRef(false);
  const confirm = (extra?: string) => {
    if (submitting.current || busy) return; // one submission per dialog, even on a fast double-click
    submitting.current = true;
    onConfirm(extra);
    // Re-arm after the request settles (dialog stays open only on a failed correction).
    setTimeout(() => (submitting.current = false), 400);
  };

  if (dialog.kind === "sell") {
    const after = dialog.team.remaining - dialog.price;
    return (
      <Modal title="CONFIRM SALE" onClose={onClose} busy={busy}>
        <div className="flex items-center gap-4">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-gold/50">
            <PlayerPhoto src={dialog.player.photo} name={dialog.player.name} sizes="80px" stage />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-black uppercase">{dialog.player.name}</p>
            <p className="text-xs font-bold tracking-[0.18em] text-gold-light">{roleText(dialog.player.role)}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-gold/10 p-4">
          <TeamLogo team={dialog.team} className="size-12 text-sm" />
          <div className="flex-1">
            <p className="text-xs font-bold tracking-[0.2em] text-white/60">SOLD TO</p>
            <p className="text-lg font-black">{dialog.team.name}</p>
          </div>
          <p className="text-3xl font-black tabular-nums text-gold-light">{inr(dialog.price)}</p>
        </div>
        <p className="mt-3 text-sm text-white/70">
          {dialog.team.name} will have <b>{inr(after)}</b> left and <b>{dialog.team.purchased + 1} / {s.rules.playersPerTeam}</b> auction players.
        </p>
        <DialogButtons busy={busy} confirmLabel="CONFIRM SOLD" onCancel={onClose} onConfirm={() => confirm()} />
      </Modal>
    );
  }
  if (dialog.kind === "unsold") {
    return (
      <Modal title="MARK UNSOLD" onClose={onClose} busy={busy}>
        <p className="text-base">
          Mark <b className="uppercase">{dialog.player.name}</b> as UNSOLD? They will not count towards any squad and stay eligible for a later round.
        </p>
        <DialogButtons busy={busy} confirmLabel="MARK UNSOLD" onCancel={onClose} onConfirm={() => confirm()} />
      </Modal>
    );
  }
  if (dialog.kind === "reverse") {
    const valid = reason.trim().length >= 5;
    return (
      <Modal title="CORRECT A SALE" onClose={onClose} busy={busy}>
        <p className="text-base">
          Reverse <b className="uppercase">{dialog.playerName}</b> → {dialog.teamName} for <b>{inr(dialog.price)}</b>? The team gets the money and the slot back, the player returns to the pool, and the original sale stays in the
          ledger marked as reversed.
        </p>
        <label htmlFor="reverse-reason" className="mt-4 block text-[11px] font-bold tracking-[0.2em] text-white/50">
          REASON (REQUIRED)
        </label>
        <textarea
          id="reverse-reason"
          data-autofocus
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-gold"
          placeholder="e.g. Wrong team entered — anchor confirmed STAR XI"
        />
        <DialogButtons busy={busy} disabled={!valid} confirmLabel="REVERSE SALE" danger onCancel={onClose} onConfirm={() => confirm(reason)} />
      </Modal>
    );
  }
  const copy: [string, string] = ({
    loadPool: ["LOAD PLAYER POOL", "Copy the current registrations into the auction pool? This replaces any pool loaded earlier. It is locked once the auction starts."],
    start: ["START AUCTION", "Start the auction? The player pool and icons are locked from this point."],
    pause: ["PAUSE AUCTION", "Pause the auction? Selecting players and sales are blocked until you resume."],
    resume: ["RESUME AUCTION", "Resume the auction?"],
    complete: ["COMPLETE AUCTION", "Complete the auction? This is final: no more sales or corrections. It only succeeds when every player is sold and every team has a full squad."],
  } satisfies Record<string, [string, string]>)[dialog.action];
  return (
    <Modal title={copy[0]} onClose={onClose} busy={busy}>
      <p className="text-base">{copy[1]}</p>
      <DialogButtons busy={busy} confirmLabel={copy[0]} onCancel={onClose} onConfirm={() => confirm()} />
    </Modal>
  );
}

function DialogButtons({ busy, disabled = false, danger = false, confirmLabel, onCancel, onConfirm }: { busy: boolean; disabled?: boolean; danger?: boolean; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost h-12">
        Cancel
      </button>
      <button type="button" data-autofocus onClick={onConfirm} disabled={busy || disabled} className={cn("h-12", danger ? "btn-danger" : "btn-gold")}>
        {busy ? "SAVING…" : confirmLabel}
      </button>
    </div>
  );
}
