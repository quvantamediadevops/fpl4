import type { AuctionPlayerStatus, AuctionRules, AuctionStatus } from "./rules";
import type { PlayerRole } from "../types/player";

/** Everything a screen needs, built by the server from D1. Public: no admin data. */
export interface AuctionSnapshot {
  version: number;
  status: AuctionStatus;
  rules: AuctionRules;
  teams: AuctionTeamView[];
  players: AuctionPlayerView[];
  currentPlayerId: string | null;
  /** Latest live sales, newest first. */
  recent: AuctionSaleView[];
  /** Latest presenter-relevant event, so screens can animate exactly once per event. */
  lastEvent: AuctionEventView | null;
  counts: { pool: number; sold: number; available: number; unsold: number; spent: number; combinedRemaining: number; filledSlots: number; totalSlots: number };
  updatedAt: string;
}

export interface AuctionTeamView {
  id: string;
  name: string;
  logo: string;
  owner: string;
  initialBudget: number;
  spent: number;
  remaining: number;
  purchased: number;
  slotsLeft: number;
  reserve: number;
  maxNextPrice: number;
  /** Pre-assigned icon player (not a registration; never part of the auction). */
  icon: { name: string } | null;
  /** Auction purchases, in purchase order. */
  players: { playerId: string; name: string; role: PlayerRole | null; price: number; photo: string | null }[];
}

export interface AuctionPlayerView {
  id: string;
  name: string;
  role: PlayerRole | null;
  photo: string | null;
  status: AuctionPlayerStatus;
  teamId: string | null;
  price: number | null;
  unsoldCount: number;
  order: number;
}

export interface AuctionSaleView {
  saleId: string;
  playerId: string;
  teamId: string;
  price: number;
  at: string;
}

export interface AuctionEventView {
  id: number;
  type: "PLAYER_SELECTED" | "PLAYER_SOLD" | "PLAYER_UNSOLD" | "SALE_REVERSED" | "AUCTION_STARTED" | "AUCTION_PAUSED" | "AUCTION_RESUMED" | "AUCTION_COMPLETED" | "POOL_LOADED";
  playerId: string | null;
  teamId: string | null;
  amount: number | null;
  at: string;
}

/** Admin-only detail: full audit log and every sale including reversed ones. */
export interface AuctionAdminDetail {
  events: (AuctionEventView & { adminId: string; metadata: Record<string, unknown> | null })[];
  sales: (AuctionSaleView & { adminId: string; reversedAt: string | null; reversedBy: string | null; reversalReason: string | null })[];
}

export type AuctionCommand =
  | { type: "loadPool"; pool: PoolInput }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "complete" }
  | { type: "select"; playerId: string }
  | { type: "sell"; playerId: string; teamId: string; price: number; idempotencyKey: string }
  | { type: "unsold"; playerId: string }
  | { type: "reverse"; saleId: string; reason: string };

export interface PoolInput {
  teams: { id: string; name: string; order: number }[];
  icons: { teamId: string; name: string }[];
  players: { id: string; key: string; name: string; role: PlayerRole | null; order: number }[];
}

export type CommandResult =
  | { ok: true; snapshot: AuctionSnapshot; saleId?: string; duplicate?: boolean }
  | { ok: false; code: string; message: string; snapshot?: AuctionSnapshot };
