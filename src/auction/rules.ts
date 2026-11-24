/*
 * Auction rules: pure functions, no imports, so they run unchanged in the
 * Durable Object, in route handlers, in the browser (for display only) and in
 * `node --test`. The server is always the authority; clients only preview.
 */

export const AUCTION_STATUSES = ["NOT_STARTED", "ACTIVE", "PAUSED", "COMPLETED"] as const;
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];
export type AuctionPlayerStatus = "AVAILABLE" | "SOLD" | "UNSOLD";

export interface AuctionRules {
  teamBudget: number;
  /** Auction purchases per team. The pre-assigned icon is extra. */
  playersPerTeam: number;
  /** Any whole-rupee price from minimumBid to maximumBid (inclusive) is allowed. */
  minimumBid: number;
  maximumBid: number;
}

export interface TeamLedger {
  initialBudget: number;
  /** Sum of live (unreversed) sale prices. */
  spent: number;
  /** Number of live (unreversed) purchases. */
  purchased: number;
}

export interface TeamPosition {
  spent: number;
  remaining: number;
  purchased: number;
  slotsLeft: number;
  /** Money that must stay unspent so every open slot can still be filled at the minimum bid. */
  reserve: number;
  /** Highest price allowed for the team's next purchase; 0 when the team cannot buy. */
  maxNextPrice: number;
  canBuy: boolean;
}

/** Budget position of a team, derived only from its live sales. */
export function teamPosition(rules: AuctionRules, ledger: TeamLedger): TeamPosition {
  const remaining = ledger.initialBudget - ledger.spent;
  const slotsLeft = Math.max(0, rules.playersPerTeam - ledger.purchased);
  const reserve = slotsLeft * rules.minimumBid;
  // After this purchase, (slotsLeft - 1) slots still need the minimum bid each.
  const afterReserve = Math.max(0, slotsLeft - 1) * rules.minimumBid;
  const maxNextPrice = slotsLeft > 0 ? Math.min(rules.maximumBid, remaining - afterReserve) : 0;
  const canBuy = slotsLeft > 0 && maxNextPrice >= rules.minimumBid;
  return { spent: ledger.spent, remaining, purchased: ledger.purchased, slotsLeft, reserve, maxNextPrice: canBuy ? maxNextPrice : 0, canBuy };
}

export type SaleRejection =
  | "AUCTION_NOT_ACTIVE"
  | "PLAYER_NOT_FOUND"
  | "PLAYER_NOT_SELECTED"
  | "PLAYER_ALREADY_SOLD"
  | "TEAM_NOT_FOUND"
  | "PRICE_NOT_WHOLE"
  | "PRICE_BELOW_MINIMUM"
  | "PRICE_ABOVE_MAXIMUM"
  | "TEAM_FULL"
  | "INSUFFICIENT_BUDGET"
  | "RESERVE_VIOLATION";

export interface SaleCheckInput {
  rules: AuctionRules;
  status: AuctionStatus;
  currentPlayerId: string | null;
  player: { id: string; status: AuctionPlayerStatus } | null;
  team: TeamLedger | null;
  price: number;
}

/** Every rule a sale must pass, in the order an operator would want to hear about them. */
export function checkSale(input: SaleCheckInput): SaleRejection | null {
  const { rules, price } = input;
  if (input.status !== "ACTIVE") return "AUCTION_NOT_ACTIVE";
  if (!input.player) return "PLAYER_NOT_FOUND";
  if (input.player.status === "SOLD") return "PLAYER_ALREADY_SOLD";
  if (input.currentPlayerId !== input.player.id) return "PLAYER_NOT_SELECTED";
  if (!input.team) return "TEAM_NOT_FOUND";
  if (!Number.isSafeInteger(price)) return "PRICE_NOT_WHOLE";
  if (price < rules.minimumBid) return "PRICE_BELOW_MINIMUM";
  if (price > rules.maximumBid) return "PRICE_ABOVE_MAXIMUM";
  const pos = teamPosition(rules, input.team);
  if (pos.slotsLeft <= 0) return "TEAM_FULL";
  if (price > pos.remaining) return "INSUFFICIENT_BUDGET";
  if (price > pos.remaining - Math.max(0, pos.slotsLeft - 1) * rules.minimumBid) return "RESERVE_VIOLATION";
  return null;
}

export function describeRejection(r: SaleRejection, rules: AuctionRules, pos?: TeamPosition): string {
  const inr = formatInr;
  switch (r) {
    case "AUCTION_NOT_ACTIVE":
      return "The auction is not running. Start or resume it first.";
    case "PLAYER_NOT_FOUND":
      return "That player is not in the auction pool. (Icon players are pre-assigned and never auctioned.)";
    case "PLAYER_NOT_SELECTED":
      return "Select this player on the presenter before confirming the sale.";
    case "PLAYER_ALREADY_SOLD":
      return "This player has already been sold.";
    case "TEAM_NOT_FOUND":
      return "Choose a valid team.";
    case "PRICE_NOT_WHOLE":
      return "Enter the price in whole rupees (no paise).";
    case "PRICE_BELOW_MINIMUM":
      return `The minimum sale price is ${inr(rules.minimumBid)}.`;
    case "PRICE_ABOVE_MAXIMUM":
      return `The maximum sale price is ${inr(rules.maximumBid)}.`;
    case "TEAM_FULL":
      return `This team already has ${rules.playersPerTeam} auction players.`;
    case "INSUFFICIENT_BUDGET":
      return pos ? `This team has only ${inr(pos.remaining)} left; the most it can pay now is ${inr(pos.maxNextPrice)}.` : "This team does not have enough budget.";
    case "RESERVE_VIOLATION":
      return pos
        ? `This team can pay at most ${inr(pos.maxNextPrice)}: it must keep ${inr(Math.max(0, pos.slotsLeft - 1) * rules.minimumBid)} for its other ${Math.max(0, pos.slotsLeft - 1)} open slots.`
        : "This price would leave the team unable to complete its squad.";
  }
}

export type TransitionRejection =
  | "POOL_NOT_LOADED"
  | "POOL_SIZE_MISMATCH"
  | "ICONS_INCOMPLETE"
  | "INVALID_TRANSITION"
  | "PLAYERS_UNSOLD"
  | "SQUADS_INCOMPLETE"
  | "BUDGET_EXCEEDED";

export interface CompletionInput {
  rules: AuctionRules;
  teamCount: number;
  iconCount: number;
  poolSize: number;
  soldCount: number;
  teams: TeamLedger[];
}

/** Pool and icon requirements for starting: every team needs exactly playersPerTeam auction players. */
export function checkStart(input: CompletionInput): TransitionRejection | null {
  if (input.poolSize === 0) return "POOL_NOT_LOADED";
  if (input.poolSize !== input.teamCount * input.rules.playersPerTeam) return "POOL_SIZE_MISMATCH";
  if (input.iconCount !== input.teamCount) return "ICONS_INCOMPLETE";
  return null;
}

export function checkCompletion(input: CompletionInput): TransitionRejection | null {
  const start = checkStart(input);
  if (start) return start;
  if (input.soldCount !== input.poolSize) return "PLAYERS_UNSOLD";
  if (input.teams.some((t) => t.purchased !== input.rules.playersPerTeam)) return "SQUADS_INCOMPLETE";
  if (input.teams.some((t) => t.spent > t.initialBudget)) return "BUDGET_EXCEEDED";
  return null;
}

export function describeTransition(r: TransitionRejection, input: CompletionInput): string {
  const need = input.teamCount * input.rules.playersPerTeam;
  switch (r) {
    case "POOL_NOT_LOADED":
      return "Load the player pool from registrations first.";
    case "POOL_SIZE_MISMATCH":
      return `The pool has ${input.poolSize} players but ${input.teamCount} teams × ${input.rules.playersPerTeam} needs exactly ${need}.`;
    case "ICONS_INCOMPLETE":
      return `Every team needs its icon player (${input.iconCount} of ${input.teamCount} set).`;
    case "INVALID_TRANSITION":
      return "That action is not available in the current auction state.";
    case "PLAYERS_UNSOLD":
      return `${input.poolSize - input.soldCount} players are still unsold.`;
    case "SQUADS_INCOMPLETE":
      return `Every team must have exactly ${input.rules.playersPerTeam} auction players.`;
    case "BUDGET_EXCEEDED":
      return "A team is over budget.";
  }
}

const TRANSITIONS: Record<"start" | "pause" | "resume" | "complete", { from: AuctionStatus[]; to: AuctionStatus }> = {
  start: { from: ["NOT_STARTED"], to: "ACTIVE" },
  pause: { from: ["ACTIVE"], to: "PAUSED" },
  resume: { from: ["PAUSED"], to: "ACTIVE" },
  complete: { from: ["ACTIVE", "PAUSED"], to: "COMPLETED" },
};

export function transitionTarget(action: keyof typeof TRANSITIONS, from: AuctionStatus): AuctionStatus | null {
  const t = TRANSITIONS[action];
  return t.from.includes(from) ? t.to : null;
}

export function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
