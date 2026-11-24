"use client";

import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import type { AuctionSnapshot } from "@/auction/types";
import { inr } from "@/components/auction/bits";

export const EASE = [0.22, 1, 0.36, 1] as const;

/** A rupee figure that counts to each new server value (instant with reduced motion). */
export function AnimatedInr({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => inr(Math.round(v)));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: EASE });
    return () => controls.stop();
  }, [mv, value, reduce]);
  return <m.span className={className}>{text}</m.span>;
}

export type TeamMark = "gain" | "loss" | "change";
export type PlayerMark = "new" | "corrected";
export interface Changes {
  /** Snapshot version that produced these marks; used as an animation key so each change plays once. */
  version: number;
  teams: ReadonlyMap<string, TeamMark>;
  players: ReadonlyMap<string, PlayerMark>;
}

const NONE: Changes = { version: -1, teams: new Map(), players: new Map() };
const HOLD_MS = 4500;

/** What changed in the squads between two server snapshots (purely visual; figures come from the server). */
function diff(prev: AuctionSnapshot, next: AuctionSnapshot): Changes {
  const before = new Map<string, { teamId: string; price: number }>();
  for (const t of prev.teams) for (const p of t.players) before.set(p.playerId, { teamId: t.id, price: p.price });
  const after = new Map<string, { teamId: string; price: number }>();
  for (const t of next.teams) for (const p of t.players) after.set(p.playerId, { teamId: t.id, price: p.price });

  const teams = new Map<string, TeamMark>();
  const players = new Map<string, PlayerMark>();
  const mark = (teamId: string, m: TeamMark) => {
    const cur = teams.get(teamId);
    teams.set(teamId, !cur || cur === m ? m : "change");
  };
  const corrected = next.lastEvent?.type === "SALE_CORRECTED" ? next.lastEvent.playerId : null;

  for (const [id, a] of after) {
    const b = before.get(id);
    if (!b) {
      players.set(id, id === corrected ? "corrected" : "new");
      mark(a.teamId, "gain");
    } else if (b.teamId !== a.teamId) {
      players.set(id, "corrected");
      mark(a.teamId, "gain");
      mark(b.teamId, "loss");
    } else if (b.price !== a.price) {
      players.set(id, "corrected");
      mark(a.teamId, "change");
    }
  }
  for (const [id, b] of before) if (!after.has(id)) mark(b.teamId, "loss");
  return { version: next.version, teams, players };
}

/**
 * Marks for the latest change while it is fresh. Starts empty on mount, so nothing
 * replays when a screen opens or the connection resyncs (same version, no change).
 */
export function useSquadChanges(snapshot: AuctionSnapshot): Changes {
  const [track, setTrack] = useState(() => ({ prev: snapshot, changes: NONE }));
  const [expired, setExpired] = useState(-1);

  if (snapshot.version > track.prev.version) {
    // After a HARD RESET nothing is "removed from a team": start clean instead of flashing every squad.
    setTrack({ prev: snapshot, changes: snapshot.resetEpoch !== track.prev.resetEpoch ? NONE : diff(track.prev, snapshot) });
  }

  useEffect(() => {
    if (track.changes.version < 0) return;
    const v = track.changes.version;
    const t = setTimeout(() => setExpired(v), HOLD_MS);
    return () => clearTimeout(t);
  }, [track.changes.version]);

  return track.changes.version === expired ? NONE : track.changes;
}
