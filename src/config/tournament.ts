import type { Fixture, MatchResult, Team, TournamentDetails } from "@/types/tournament";

/*
 * Official tournament content. Everything is empty until the organisers
 * supply it — pages show an empty state instead of placeholder data.
 * Add entries here and redeploy; the pages pick them up automatically.
 */

// Source: FPL Season 4 Team Owner / Icon List. Spellings are as supplied.
export const teams: Team[] = [
  { number: 1, slug: "msct", name: "MSCT", owner: "LIPUNA", icon: "SONU", monogram: "MSCT", logo: "/Teamlogo/MSCT.jpeg" },
  { number: 2, slug: "star-xi", name: "STAR XI", owner: "ANUKUL", icon: "AJIT (AJU)", monogram: "SXI", logo: "/Teamlogo/STARXI.jpeg" },
  { number: 3, slug: "iconic", name: "ICONIC", owner: "RABI", icon: "RABI", monogram: "IC", logo: "/Teamlogo/ICONIC.jpeg" },
  { number: 4, slug: "limited-lions", name: "LIMITED LIONS", owner: "SRINIVAS", icon: "RAJA", monogram: "LL", logo: "/Teamlogo/LIMITEDLION.jpeg" },
  { number: 5, slug: "rkct", name: "RKCT", owner: "PAPU / CHIKU", icon: "AYUSH", monogram: "RKCT", logo: "/Teamlogo/RKCT.jpeg" },
  { number: 6, slug: "royal-boyzz", name: "ROYAL BOYZZ", owner: "DURGA", icon: "SINKU", monogram: "RB", logo: "/Teamlogo/ROYALBOYZZ.jpeg" },
  { number: 7, slug: "myct", name: "MYCT", owner: "DEEPTI", icon: "VIJAY (BIJU)", monogram: "MYCT", logo: "/Teamlogo/MYCT.jpeg" },
  { number: 8, slug: "bajarangmonks", name: "BAJARANGMONKS", owner: "PRADYUMNA", icon: "SACHIN", monogram: "BM", logo: "/Teamlogo/BAJRANGMONK.jpeg" },
];

export const fixtures: Fixture[] = [];

export const results: MatchResult[] = [];

// Source: official FPL Season 4 tournament poster. Single source of truth for
// every page — change values here only.
export const tournament: TournamentDetails = {
  name: "FERTILIZER PREMIER LEAGUE",
  season: "SEASON 4",
  year: 2026,
  venue: {
    ground: "Indirapalli Cricket Ground",
    area: "Balliodi",
    township: "Fertilizer Township",
    sector: "Sector 22",
  },
  auction: { date: "2026-11-28", time: "17:00", budget: 3500 },
  matchStart: "2026-12-05",
  deadlines: { team: "2026-11-20", player: "2026-11-25" },
  prizes: { winner: 50000, runnerUp: 30000 },
  fees: { franchise: 9000, iconPlayer: 500, player: 100 },
  contacts: [
    { name: "Chandan", phone: "9337997437" },
    { name: "Rahul", phone: "9692165185" },
    { name: "Aju", phone: "7377921758" },
    { name: "Raja", phone: "7873120289" },
  ],
};

/** Number of participating teams, derived from the team list (8). */
export const teamCount = teams.length;
