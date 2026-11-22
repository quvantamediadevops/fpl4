import { clsx, type ClassValue } from "clsx";
import type { PlayerRole } from "@/types/player";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** FNV-1a 32-bit hash, hex. Deterministic across runtimes. */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "player"
  );
}

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function formatNumber(n: number): string {
  return `#${String(n).padStart(3, "0")}`;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters
    .map((p) => p?.[0] ?? "")
    .join("")
    .toUpperCase();
}

export const roleMeta: Record<
  PlayerRole,
  { label: string; plural: string; badge: string; dot: string }
> = {
  BATSMAN: {
    label: "Batsman",
    plural: "Batsmen",
    badge: "bg-bat/8 text-bat ring-bat/20",
    dot: "bg-bat",
  },
  BOWLER: {
    label: "Bowler",
    plural: "Bowlers",
    badge: "bg-bowl/8 text-bowl-deep ring-bowl/25",
    dot: "bg-bowl",
  },
  "ALL ROUNDER": {
    label: "All Rounder",
    plural: "All Rounders",
    badge: "bg-ar/8 text-ar ring-ar/20",
    dot: "bg-ar",
  },
};
