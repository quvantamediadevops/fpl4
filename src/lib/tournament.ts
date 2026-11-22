import { tournament } from "@/config/tournament";

const IST = "+05:30";
const TZ = "Asia/Kolkata";
const DAY = 86_400_000;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** ₹50,000 */
export const formatINR = (amount: number) => inr.format(amount);

/** 05 December 2026 (long) or 05 Dec 2026 (short) */
export function formatDate(iso: string, style: "long" | "short" = "long"): string {
  return new Date(`${iso}T12:00:00${IST}`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: style,
    year: "numeric",
    timeZone: TZ,
  });
}

/** 5:00 PM */
export function formatTime(hhmm: string): string {
  return new Date(`2000-01-01T${hhmm}:00${IST}`)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })
    .replace(/ /g, " ");
}

export function dayParts(iso: string) {
  const d = new Date(`${iso}T12:00:00${IST}`);
  return {
    day: d.toLocaleDateString("en-GB", { day: "2-digit", timeZone: TZ }),
    month: d.toLocaleDateString("en-GB", { month: "short", timeZone: TZ }).toUpperCase(),
    weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ }),
  };
}

/** Whole calendar days from today (IST) to the given date. Negative = past. */
function daysUntil(iso: string, now: Date): number {
  const today = new Date(now.toLocaleDateString("en-CA", { timeZone: TZ }) + `T00:00:00${IST}`);
  const target = new Date(`${iso}T00:00:00${IST}`);
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

export type Status = { tone: "closed" | "today" | "upcoming" | "done"; label: string };

function relative(days: number): string {
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

/** A registration deadline closes at the end of its day (IST). It never claims registration is open. */
export function deadlineStatus(iso: string, now = new Date()): Status {
  const d = daysUntil(iso, now);
  if (d < 0) return { tone: "closed", label: "Closed" };
  if (d === 0) return { tone: "today", label: "Last date today" };
  return { tone: "upcoming", label: d === 1 ? "Last date tomorrow" : `${d} days left` };
}

export function eventStatus(iso: string, now = new Date()): Status {
  const d = daysUntil(iso, now);
  if (d < 0) return { tone: "done", label: "Completed" };
  if (d === 0) return { tone: "today", label: "Today" };
  return { tone: "upcoming", label: relative(d) };
}

export const venueLine = () => {
  const v = tournament.venue;
  return `${v.ground}, ${v.area}, ${v.township}, ${v.sector}`;
};

export const mapsUrl = () => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueLine())}`;

export const telHref = (phone: string) => `tel:+91${phone}`;

export interface KeyDate {
  id: string;
  label: string;
  date: string;
  time?: string;
  kind: "deadline" | "event";
}

/** Chronological key dates for the season. */
export function keyDates(): KeyDate[] {
  const t = tournament;
  return [
    { id: "team-deadline", label: "Team registration last date", date: t.deadlines.team, kind: "deadline" as const },
    { id: "player-deadline", label: "Player registration last date", date: t.deadlines.player, kind: "deadline" as const },
    { id: "auction", label: "Player auction", date: t.auction.date, time: t.auction.time, kind: "event" as const },
    { id: "match-start", label: "Matches start", date: t.matchStart, kind: "event" as const },
  ].sort((a, b) => a.date.localeCompare(b.date));
}
