export interface Team {
  /** Display order, 1-based. */
  number: number;
  slug: string;
  name: string;
  owner: string;
  /** The team's icon player. */
  icon: string;
  /** Short text mark shown when no logo image is supplied. */
  monogram: string;
  /** Official logo under /public, e.g. /Teamlogo/MSCT.jpeg (initials shown if missing or it fails to load). */
  logo?: string;
}

export type MatchStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "POSTPONED" | "CANCELLED";

export interface Fixture {
  matchNumber: number;
  teamA: string;
  teamB: string;
  /** ISO date, e.g. 2026-12-14 */
  date: string;
  /** 24h local time, e.g. 09:30 */
  time?: string;
  venue?: string;
  status: MatchStatus;
}

export interface InningsScore {
  team: string;
  runs: number;
  wickets: number;
  overs: string;
}

export interface MatchResult {
  matchNumber: number;
  date: string;
  innings: [InningsScore, InningsScore];
  winner?: string;
  summary: string;
  playerOfTheMatch?: string;
}

export interface Contact {
  name: string;
  /** Digits exactly as published on the official poster. */
  phone: string;
}

export interface TournamentDetails {
  name: string;
  season: string;
  year: number;
  venue: { ground: string; area: string; township: string; sector: string };
  /** ISO dates (YYYY-MM-DD) and 24h times, interpreted in India Standard Time. */
  auction: { date: string; time: string; budget: number };
  matchStart: string;
  deadlines: { team: string; player: string };
  prizes: { winner: number; runnerUp: number };
  fees: { franchise: number; iconPlayer: number; player: number };
  contacts: Contact[];
}
