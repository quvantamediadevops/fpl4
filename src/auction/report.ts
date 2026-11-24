import { formatInr } from "./rules";
import type { AuctionSnapshot } from "./types";

const ROLE: Record<string, string> = { BATSMAN: "Batsman", BOWLER: "Bowler", "ALL ROUNDER": "All-Rounder" };

function csvCell(value: string | number): string {
  const s = String(value);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function auctionCsv(s: AuctionSnapshot): string {
  const rows: (string | number)[][] = [["Team", "Slot", "Player", "Type", "Price (INR)"]];
  for (const t of s.teams) {
    rows.push([t.name, "ICON", t.icon?.name ?? "", "Icon (pre-assigned)", 0]);
    t.players.forEach((p, i) => rows.push([t.name, i + 1, p.name, p.role ? ROLE[p.role] ?? p.role : "", p.price]));
    rows.push([t.name, "TOTAL SPENT", "", "", t.spent]);
    rows.push([t.name, "REMAINING", "", "", t.remaining]);
  }
  rows.push([]);
  rows.push(["ALL TEAMS", "TOTAL EXPENDITURE", "", "", s.counts.spent]);
  const unsold = s.players.filter((p) => p.status !== "SOLD");
  if (unsold.length) {
    rows.push([]);
    rows.push(["NOT SOLD", "Status", "Player", "Type", ""]);
    for (const p of unsold) rows.push(["", p.status, p.name, p.role ? ROLE[p.role] ?? p.role : "", ""]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const roleLabel = (role: string | null) => (role ? ROLE[role] ?? role : "—");
export { formatInr };
