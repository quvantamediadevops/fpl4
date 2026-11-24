import { CORRECTION_LABEL, SALE_STATE_LABEL, saleHistory } from "./history";
import { formatInr } from "./rules";
import type { AuctionAdminDetail, AuctionSnapshot } from "./types";

const ROLE: Record<string, string> = { BATSMAN: "Batsman", BOWLER: "Bowler", "ALL ROUNDER": "All-Rounder" };

function csvCell(value: string | number): string {
  const s = String(value);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function auctionCsv(s: AuctionSnapshot, detail?: AuctionAdminDetail): string {
  const rows: (string | number)[][] = [["Team", "Slot", "Player", "Type", "Price (INR)"]];
  for (const t of s.teams) {
    rows.push([t.name, "ICON", t.icon?.name ?? "", "Icon (pre-assigned)", ""]);
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
  if (detail) {
    const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;
    const team = (id: string | null) => (id ? s.teams.find((t) => t.id === id)?.name ?? id : "");
    rows.push([]);
    rows.push(["SALE HISTORY", "Kind", "Status", "Player", "Team", "Price (INR)", "Time (UTC)", "Admin", "Correction"]);
    for (const h of saleHistory(detail).slice().reverse()) {
      const correction = h.endedBy
        ? `${CORRECTION_LABEL[h.endedBy.action]}${h.endedBy.toTeamId ? ` → ${team(h.endedBy.toTeamId)} ${h.endedBy.toPrice}` : ""} by ${h.endedBy.adminId}: ${h.endedBy.reason}`
        : h.reversedAt
          ? `Reversed by ${h.reversedBy}: ${h.reversalReason}`
          : "";
      rows.push(["", h.origin === "CORRECTION" ? "CORRECTED SALE" : "ORIGINAL SALE", SALE_STATE_LABEL[h.state], name(h.playerId), team(h.teamId), h.price, h.at, h.adminId, correction]);
    }
    const reopens = detail.corrections.filter((c) => c.action === "REOPEN_PLAYER");
    if (reopens.length) {
      rows.push([]);
      rows.push(["REOPENED PLAYERS", "Player", "Time (UTC)", "Admin", "Reason"]);
      for (const c of reopens) rows.push(["", name(c.playerId), c.at, c.adminId, c.reason]);
    }
  }
  // UTF-8 BOM so Excel opens ₹ and names correctly.
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const roleLabel = (role: string | null) => (role ? ROLE[role] ?? role : "—");
export { formatInr };
