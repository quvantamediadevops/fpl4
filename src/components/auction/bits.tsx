"use client";

import Image from "next/image";
import { useState } from "react";
import { formatInr } from "@/auction/rules";
import type { AuctionSnapshot, AuctionTeamView } from "@/auction/types";
import { cn, initials } from "@/lib/utils";
import type { PlayerRole } from "@/types/player";
import type { Connection } from "./useAuctionLive";

export const inr = formatInr;

export const ROLE_TEXT: Record<PlayerRole, string> = { BATSMAN: "BATSMAN", BOWLER: "BOWLER", "ALL ROUNDER": "ALL-ROUNDER" };
export const roleText = (role: PlayerRole | null) => (role ? ROLE_TEXT[role] : "ROLE NOT LISTED");

const STATUS_TEXT: Record<AuctionSnapshot["status"], string> = {
  NOT_STARTED: "NOT STARTED",
  ACTIVE: "LIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
};

export function StatusPill({ status, className }: { status: AuctionSnapshot["status"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold tracking-[0.2em]",
        status === "ACTIVE" && "border-emerald-400/50 bg-emerald-400/10 text-emerald-300",
        status === "PAUSED" && "border-amber-400/50 bg-amber-400/10 text-amber-300",
        status === "NOT_STARTED" && "border-white/20 bg-white/5 text-white/70",
        status === "COMPLETED" && "border-gold/60 bg-gold/15 text-gold-light",
        className,
      )}
    >
      {status === "ACTIVE" && <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />}
      {STATUS_TEXT[status]}
    </span>
  );
}

export function ConnectionPill({ connection, className }: { connection: Connection; className?: string }) {
  const live = connection === "live";
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide", live ? "text-emerald-300" : "text-amber-300", className)}
    >
      <span className={cn("size-2 rounded-full", live ? "bg-emerald-400" : "animate-pulse bg-amber-400")} aria-hidden="true" />
      {live ? "Connected" : connection === "connecting" ? "Connecting…" : "Reconnecting…"}
    </span>
  );
}

/** Official team logo; monogram fallback if the file is missing or fails. */
export function TeamLogo({ team, className }: { team: Pick<AuctionTeamView, "name" | "logo">; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-full bg-[#0b1220] ring-1 ring-gold/40", className)}>
      {team.logo && !failed ? (
        <Image src={team.logo} alt={`${team.name} logo`} fill sizes="96px" className="object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-[0.65em] font-black text-gold-light" aria-label={`${team.name} logo`}>
          {initials(team.name)}
        </span>
      )}
    </span>
  );
}

/** green / amber / red by remaining budget per open slot. */
export function budgetTone(team: AuctionTeamView): "done" | "good" | "tight" | "low" {
  if (team.slotsLeft === 0) return "done";
  const ratio = team.remaining / team.initialBudget;
  if (ratio > 0.5) return "good";
  if (ratio > 0.2) return "tight";
  return "low";
}

export const TONE_BAR: Record<ReturnType<typeof budgetTone>, string> = {
  done: "bg-gold",
  good: "bg-emerald-400",
  tight: "bg-amber-400",
  low: "bg-red-500",
};
export const TONE_TEXT: Record<ReturnType<typeof budgetTone>, string> = {
  done: "text-gold-light",
  good: "text-emerald-300",
  tight: "text-amber-300",
  low: "text-red-400",
};
