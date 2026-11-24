import type { Team } from "@/types/tournament";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * A team's ICON photo (from the tournament config), returned only when the ICON
 * being shown is that team's configured ICON — so a photo can never be attached
 * to a different person. Otherwise undefined (the caller shows a placeholder).
 */
export function iconPhotoOf(team: Pick<Team, "icon" | "iconPhoto"> | undefined, iconName: string | null | undefined): string | undefined {
  if (!team?.iconPhoto || !iconName) return undefined;
  return norm(iconName) === norm(team.icon) ? team.iconPhoto : undefined;
}
