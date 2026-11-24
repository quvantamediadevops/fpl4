import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AUCTION_ROOM_NAME, type AuctionEnv } from "./cf";
import type { AuctionAdminDetail, AuctionCommand, AuctionSnapshot, CommandResult } from "./types";

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
