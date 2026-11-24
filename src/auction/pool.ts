import "server-only";
import { teams } from "@/config/tournament";
import { getPlayerDirectory } from "@/lib/players";
import type { PoolInput } from "./types";

export type PoolBuild = { ok: true; pool: PoolInput; registered: number } | { ok: false; message: string };

/**
 * Builds the auction pool from the live registration list (existing Google Sheets
 * integration) and the official team/icon list. Every registered player is in the
 * pool; icon players are separate people, pre-assigned to their teams, and are
 * never registrations (a registered player who shares an icon's name is a
 * different person and stays in the auction).
 */
export async function buildPool(): Promise<PoolBuild> {
  const directory = await getPlayerDirectory();
  if (!directory.ok) return { ok: false, message: "Registrations could not be loaded from the sheet. Try again in a moment." };

  const players = directory.data.players.map((p, i) => ({ id: p.id, key: p.key, name: p.name, role: p.role, order: i + 1 }));

  return {
    ok: true,
    registered: directory.data.players.length,
    pool: {
      teams: teams.map((t) => ({ id: t.slug, name: t.name, order: t.number })),
      icons: teams.map((t) => ({ teamId: t.slug, name: t.icon })),
      players,
    },
  };
}
