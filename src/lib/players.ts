import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getSheetsConfig } from "@/lib/env";
import { parsePhotoSource, photoIdentity } from "@/lib/google-drive";
import { SheetsError, fetchPublicColumns, type PublicColumns } from "@/lib/google-sheets";
import { getCachedDataset } from "@/lib/player-cache";
import { slugify, stableHash } from "@/lib/utils";
import type {
  PlayerDataset,
  PlayerDirectoryResult,
  PlayerRecord,
  PlayerRole,
  PlayerStats,
  PublicPlayer,
} from "@/types/player";

const ROLE_ALIASES: Record<string, PlayerRole> = {
  BATSMAN: "BATSMAN",
  BATSMEN: "BATSMAN",
  BATSWOMAN: "BATSMAN",
  BATTER: "BATSMAN",
  BATTING: "BATSMAN",
  BOWLER: "BOWLER",
  BOWLING: "BOWLER",
  ALLROUNDER: "ALL ROUNDER",
  ALLROUNDERS: "ALL ROUNDER",
};

export function normalizeRole(raw: string | undefined): PlayerRole | null {
  const key = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return ROLE_ALIASES[key] ?? null;
}

export function normalizeName(raw: string | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!/[\p{L}]/u.test(name)) return null;
  const sameCase = name === name.toUpperCase() || name === name.toLowerCase();
  if (!sameCase) return name;
  return name.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function buildDataset(columns: PublicColumns): PlayerDataset {
  const rowCount = Math.max(columns.names.length, columns.photos.length, columns.roles.length);
  const seen = new Set<string>();
  const usedKeys = new Set<string>();
  const players: PlayerRecord[] = [];
  let skippedNoName = 0;
  let duplicates = 0;
  let invalidRole = 0;

  for (let i = 0; i < rowCount; i++) {
    const rawName = columns.names[i] ?? "";
    const rawPhoto = (columns.photos[i] ?? "").trim();
    const rawRole = (columns.roles[i] ?? "").trim();

    if (!rawName.trim() && !rawPhoto && !rawRole) continue; // empty row

    const name = normalizeName(rawName);
    if (!name) {
      skippedNoName++;
      continue;
    }

    const photoSource = rawPhoto ? parsePhotoSource(rawPhoto) : null;
    const role = normalizeRole(rawRole);
    if (!role) invalidRole++;

    // Only identical submissions are merged (same name + same photo). Two
    // different people may share a name, so those are never collapsed.
    const dedupeKey = `${name.toLowerCase()}|${photoIdentity(photoSource)}`;
    if (seen.has(dedupeKey)) {
      duplicates++;
      continue;
    }
    seen.add(dedupeKey);

    // Google Forms gives every upload a unique Drive file ID, so it is the
    // most stable record identifier available without reading private columns.
    const sheetRow = i + 2;
    const identity = photoIdentity(photoSource) || `row:${sheetRow}|${name.toLowerCase()}`;
    let key = stableHash(identity);
    if (usedKeys.has(key)) key = stableHash(`${identity}|${sheetRow}`);
    usedKeys.add(key);

    players.push({
      id: `${slugify(name)}-${key}`,
      key,
      number: players.length + 1,
      name,
      role,
      photoSource,
    });
  }

  if (skippedNoName || duplicates || invalidRole) {
    console.warn(
      `[players] skipped ${skippedNoName} rows without a name, merged ${duplicates} duplicate rows, ${invalidRole} rows have a missing or unrecognised role`,
    );
  }

  return { players, stats: computeStats(players), fetchedAt: new Date().toISOString() };
}

export function computeStats(players: PlayerRecord[]): PlayerStats {
  const stats: PlayerStats = { total: players.length, batsmen: 0, bowlers: 0, allRounders: 0, unassigned: 0 };
  for (const p of players) {
    if (p.role === "BATSMAN") stats.batsmen++;
    else if (p.role === "BOWLER") stats.bowlers++;
    else if (p.role === "ALL ROUNDER") stats.allRounders++;
    else stats.unassigned++;
  }
  return stats;
}

async function loadDataset(): Promise<PlayerDataset> {
  const config = getSheetsConfig();
  if (!config) throw new SheetsError("auth", "Google Sheets is not configured");
  return buildDataset(await fetchPublicColumns(config));
}

/** Single entry point for player data. Deduplicated per request; cached across requests in player-cache. */
export const getPlayerDirectory = cache(async (): Promise<PlayerDirectoryResult> => {
  await connection();
  const config = getSheetsConfig();
  if (!config) return { ok: false, reason: "not_configured" };

  try {
    const source = stableHash(`${config.spreadsheetId}|${config.sheetGid ?? config.sheetName}|${Object.values(config.columns).join("")}`);
    const { data, stale } = await getCachedDataset(loadDataset, config.cacheSeconds, source);
    return { ok: true, data, stale };
  } catch (error) {
    const code = error instanceof SheetsError ? error.code : "unknown";
    console.error(`[players] no cached player data available (${code}); showing the unavailable state`);
    return { ok: false, reason: "unavailable" };
  }
});

export function keyFromId(id: string): string {
  return id.slice(id.lastIndexOf("-") + 1).toLowerCase();
}

export function findPlayer(dataset: PlayerDataset, idOrKey: string): PlayerRecord | undefined {
  const key = keyFromId(idOrKey);
  return dataset.players.find((p) => p.key === key);
}

export function photoPath(player: PlayerRecord): string | null {
  return player.photoSource ? `/api/photos/${player.key}` : null;
}

/** Strips server-only fields. Use for every object passed to the client. */
export function toPublicPlayer(player: PlayerRecord): PublicPlayer {
  return {
    id: player.id,
    number: player.number,
    name: player.name,
    role: player.role,
    photo: photoPath(player),
  };
}
