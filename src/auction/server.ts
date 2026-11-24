import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AUCTION_ROOM_NAME, type AuctionEnv } from "./cf";
import type { ResetEnvironment, ResetInfo } from "./reset";
import type { AuctionAdminDetail, AuctionCommand, AuctionSnapshot, CommandResult, ResetRequest } from "./types";

/** Auction bindings, or null where they are not configured (e.g. plain `next start`). */
export function auctionEnv(): AuctionEnv | null {
  try {
    const env = getCloudflareContext().env as unknown as Partial<AuctionEnv>;
    return env.AUCTION_DB && env.AUCTION_ROOM ? (env as AuctionEnv) : null;
  } catch {
    return null;
  }
}

function room(env: AuctionEnv) {
  return env.AUCTION_ROOM.get(env.AUCTION_ROOM.idFromName(AUCTION_ROOM_NAME));
}

export async function fetchSnapshot(env: AuctionEnv): Promise<AuctionSnapshot> {
  const res = await room(env).fetch("https://auction-room/state");
  if (!res.ok) throw new Error(`auction state ${res.status}`);
  return (await res.json()) as AuctionSnapshot;
}

export async function fetchAdminDetail(env: AuctionEnv): Promise<AuctionAdminDetail> {
  const res = await room(env).fetch("https://auction-room/admin-detail");
  if (!res.ok) throw new Error(`auction detail ${res.status}`);
  return (await res.json()) as AuctionAdminDetail;
}

export async function runCommand(env: AuctionEnv, adminId: string, command: AuctionCommand): Promise<CommandResult> {
  const res = await room(env).fetch("https://auction-room/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminId, command }),
  });
  return (await res.json()) as CommandResult;
}

/** HARD RESET (super-admin only; the caller has already checked session, origin, CSRF and confirmation). */
export async function runReset(env: AuctionEnv, adminId: string, reset: ResetRequest): Promise<CommandResult> {
  const res = await room(env).fetch("https://auction-room/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminId, reset }),
  });
  return (await res.json()) as CommandResult;
}

export async function fetchResetInfo(env: AuctionEnv, environment: ResetEnvironment): Promise<ResetInfo> {
  const res = await room(env).fetch(`https://auction-room/reset-info?environment=${environment}`);
  if (!res.ok) throw new Error(`reset info ${res.status}`);
  return (await res.json()) as ResetInfo;
}

/** A stored backup's JSON, or null. Super-admin only (checked by the caller). */
export async function fetchResetBackup(env: AuctionEnv, id: string): Promise<string | null> {
  const res = await room(env).fetch(`https://auction-room/reset-backup?id=${encodeURIComponent(id)}`);
  return res.ok ? res.text() : null;
}
