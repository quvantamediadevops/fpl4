/*
 * HARD RESET contract shared by the browser and the server (pure; no runtime imports).
 * The server re-validates everything here; the browser only mirrors it for the UI.
 */

/** Must be typed exactly (case-sensitive, no extra spaces). */
export const RESET_PHRASE = "RESET FPL SEASON 4 AUCTION";
export const RESET_ACKNOWLEDGEMENT = "I understand that all auction transactions and history will be permanently erased.";

/** Minimum gap between reset attempts, and a hard cap per hour (persisted in the admin audit). */
export const RESET_COOLDOWN_MS = 5_000;
export const RESET_MAX_PER_HOUR = 20;
/** Verified backups kept in the auction server's private storage (oldest are pruned). */
export const RESET_BACKUPS_KEPT = 20;

export const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const BACKUP_ID = /^bk-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/;

export type ResetEnvironment = "LOCAL" | "PRODUCTION";

/** LOCAL only for the local Workers preview; anything else is treated as production. */
export function resetEnvironment(url: string): ResetEnvironment {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1" || host.endsWith(".localhost") ? "LOCAL" : "PRODUCTION";
  } catch {
    return "PRODUCTION";
  }
}

export function phraseMatches(value: unknown): boolean {
  return value === RESET_PHRASE;
}

/** Admin names allowed to reset (AUCTION_SUPER_ADMINS: comma/space separated). Empty means nobody. */
export function superAdminNames(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,;]+/)
      .map((n) => n.trim().toLowerCase())
      .filter((n) => /^[a-z0-9_-]{2,32}$/.test(n)),
  );
}

export interface ResetBackupInfo {
  id: string;
  createdAt: string;
  bytes: number;
  sha256: string;
  /** Rows saved per table. */
  rows: Record<string, number>;
  environment: ResetEnvironment;
  database: string;
  /** Production only: restore D1 to this moment with Time Travel (`wrangler d1 time-travel restore`). */
  restorePoint: string;
}

export interface ResetOutcome {
  requestId: string;
  completedAt: string;
  backup: ResetBackupInfo;
}

export interface ResetInfo {
  environment: ResetEnvironment;
  database: string;
  lastReset: { at: string; adminId: string; requestId: string; backupRef: string | null } | null;
  backups: { id: string; createdAt: string; bytes: number; sha256: string }[];
}
