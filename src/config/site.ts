export const site = {
  name: "Fertilizer Premier League",
  nameUpper: "FERTILIZER PREMIER LEAGUE",
  season: "Season 4",
  seasonUpper: "SEASON 4",
  short: "FPL S4",
  title: "Fertilizer Premier League – Season 4 | Official Tournament Website",
  description:
    "Explore Fertilizer Premier League Season 4. Discover registered players, teams, fixtures, tournament information and official match results.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  playersPerPage: 12,
} as const;

export const navItems = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/players", label: "Players", short: "Players" },
  { href: "/teams", label: "Teams", short: "Teams" },
  { href: "/fixtures", label: "Fixtures", short: "Fixtures" },
  { href: "/results", label: "Results", short: "Results" },
  { href: "/tournament-info", label: "Tournament Info", short: "Info" },
] as const;

export type NavHref = (typeof navItems)[number]["href"];
