export const PLAYER_ROLES = ["BATSMAN", "BOWLER", "ALL ROUNDER"] as const;

export type PlayerRole = (typeof PLAYER_ROLES)[number];

export type RoleFilter = "ALL" | PlayerRole;

/** Server-only record. `photoSource` never leaves the server. */
export interface PlayerRecord {
  id: string;
  /** Short stable key used to resolve the player (suffix of `id`). */
  key: string;
  /** Website-generated display number, in sheet order. Not the registration field. */
  number: number;
  name: string;
  /** null when the sheet value is missing or not a recognised role. */
  role: PlayerRole | null;
  photoSource: PhotoSource | null;
}

export type PhotoSource =
  | { kind: "drive"; fileId: string }
  | { kind: "direct"; url: string };

/** The only shape sent to the browser. */
export interface PublicPlayer {
  id: string;
  number: number;
  name: string;
  role: PlayerRole | null;
  /** Same-origin proxy path, or null when no usable photo was supplied. */
  photo: string | null;
}

export interface PlayerStats {
  total: number;
  batsmen: number;
  bowlers: number;
  allRounders: number;
  /** Players whose role is missing or unrecognised (counted in total only). */
  unassigned: number;
}

export interface PlayerDataset {
  players: PlayerRecord[];
  stats: PlayerStats;
  fetchedAt: string;
}

export type PlayerDirectoryResult =
  | { ok: true; data: PlayerDataset; stale: boolean }
  | { ok: false; reason: "not_configured" | "unavailable" };
