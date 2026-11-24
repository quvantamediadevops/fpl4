// Auction rule tests. Run: npm run test:auction
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCompletion, checkSale, checkStart, teamPosition, transitionTarget, type AuctionRules, type SaleCheckInput } from "../src/auction/rules.ts";

const rules: AuctionRules = { teamBudget: 4000, playersPerTeam: 11, minimumBid: 100, maximumBid: 3000 };
const team = (spent: number, purchased: number) => ({ initialBudget: 4000, spent, purchased });

const sale = (over: Partial<SaleCheckInput> = {}): SaleCheckInput => ({
  rules,
  status: "ACTIVE",
  currentPlayerId: "p1",
  player: { id: "p1", status: "AVAILABLE" },
  team: team(0, 0),
  price: 100,
  ...over,
});

test("fresh team: 11 slots, ₹1,100 reserve, max next price capped at ₹3,000", () => {
  const p = teamPosition(rules, team(0, 0));
  assert.deepEqual([p.remaining, p.slotsLeft, p.reserve, p.maxNextPrice], [4000, 11, 1100, 3000]);
});

test("any whole-rupee price between ₹100 and ₹3,000 is accepted", () => {
  for (const price of [100, 101, 137, 999, 1234, 2001, 2999, 3000]) assert.equal(checkSale(sale({ price })), null, `₹${price}`);
});

test("minimum and maximum are inclusive; just outside is rejected", () => {
  assert.equal(checkSale(sale({ price: 100 })), null);
  assert.equal(checkSale(sale({ price: 99 })), "PRICE_BELOW_MINIMUM");
  assert.equal(checkSale(sale({ price: 3000 })), null);
  assert.equal(checkSale(sale({ price: 3001 })), "PRICE_ABOVE_MAXIMUM");
});

test("paise and non-numbers are rejected", () => {
  for (const price of [150.5, 100.01, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(checkSale(sale({ price })), "PRICE_NOT_WHOLE");
});

test("brief example: 8 bought, ₹3,500 spent → reserve ₹300, max ₹300", () => {
  const p = teamPosition(rules, team(3500, 8));
  assert.deepEqual([p.remaining, p.slotsLeft, p.reserve, p.maxNextPrice], [500, 3, 300, 300]);
  assert.equal(checkSale(sale({ team: team(3500, 8), price: 300 })), null);
  assert.equal(checkSale(sale({ team: team(3500, 8), price: 301 })), "RESERVE_VIOLATION");
});

test("reserve with odd amounts: ₹2,987 first buy leaves exactly ₹113 for the next", () => {
  assert.equal(checkSale(sale({ price: 2987 })), null);
  const p = teamPosition(rules, team(2987, 1));
  assert.equal(p.maxNextPrice, 113); // 1,013 − 9 × 100
  assert.equal(checkSale(sale({ team: team(2987, 1), price: 113 })), null);
  assert.equal(checkSale(sale({ team: team(2987, 1), price: 114 })), "RESERVE_VIOLATION");
});

test("last slot may use the whole remaining budget (up to ₹3,000)", () => {
  assert.equal(teamPosition(rules, team(2873, 10)).maxNextPrice, 1127);
  assert.equal(checkSale(sale({ team: team(2873, 10), price: 1127 })), null);
  assert.equal(checkSale(sale({ team: team(2873, 10), price: 1128 })), "INSUFFICIENT_BUDGET");
});

test("team full, already sold, wrong player, inactive auction, unknown team or player", () => {
  assert.equal(checkSale(sale({ team: team(1100, 11) })), "TEAM_FULL");
  assert.equal(teamPosition(rules, team(1100, 11)).canBuy, false);
  assert.equal(checkSale(sale({ player: { id: "p1", status: "SOLD" } })), "PLAYER_ALREADY_SOLD");
  assert.equal(checkSale(sale({ currentPlayerId: "p2" })), "PLAYER_NOT_SELECTED");
  assert.equal(checkSale(sale({ status: "PAUSED" })), "AUCTION_NOT_ACTIVE");
  assert.equal(checkSale(sale({ team: null })), "TEAM_NOT_FOUND");
  assert.equal(checkSale(sale({ player: null })), "PLAYER_NOT_FOUND");
});

test("unsold players can be sold in a later round", () => {
  assert.equal(checkSale(sale({ player: { id: "p1", status: "UNSOLD" } })), null);
});

test("always paying the maximum still completes 11 within ₹4,000", () => {
  let ledger = team(0, 0);
  for (let i = 0; i < 11; i++) {
    const p = teamPosition(rules, ledger);
    assert.ok(p.canBuy, `slot ${i + 1} must be affordable`);
    assert.equal(checkSale(sale({ team: ledger, price: p.maxNextPrice })), null);
    ledger = { ...ledger, spent: ledger.spent + p.maxNextPrice, purchased: ledger.purchased + 1 };
  }
  assert.equal(ledger.purchased, 11);
  assert.equal(ledger.spent, 4000);
});

test("random whole-rupee purchases never strand or overspend a team (20k squads)", () => {
  for (let run = 0; run < 20_000; run++) {
    let ledger = team(0, 0);
    while (ledger.purchased < 11) {
      const p = teamPosition(rules, ledger);
      assert.ok(p.canBuy);
      const price = rules.minimumBid + Math.floor(Math.random() * (p.maxNextPrice - rules.minimumBid + 1));
      assert.equal(checkSale(sale({ team: ledger, price })), null);
      // One rupee more than the maximum must always be refused.
      assert.notEqual(checkSale(sale({ team: ledger, price: p.maxNextPrice + 1 })), null);
      ledger = { ...ledger, spent: ledger.spent + price, purchased: ledger.purchased + 1 };
    }
    assert.ok(ledger.spent >= 1100 && ledger.spent <= 4000);
  }
});

test("start requires 8 × 11 = 88 pool players and 8 icons", () => {
  const base = { rules, teamCount: 8, iconCount: 8, poolSize: 88, soldCount: 0, teams: [] };
  assert.equal(checkStart(base), null);
  assert.equal(checkStart({ ...base, poolSize: 0 }), "POOL_NOT_LOADED");
  assert.equal(checkStart({ ...base, poolSize: 86 }), "POOL_SIZE_MISMATCH");
  assert.equal(checkStart({ ...base, poolSize: 89 }), "POOL_SIZE_MISMATCH");
  assert.equal(checkStart({ ...base, iconCount: 7 }), "ICONS_INCOMPLETE");
});

test("completion requires all 88 sold, exactly 11 per team, icons present, nobody over budget", () => {
  const full = Array.from({ length: 8 }, () => team(3000, 11));
  const base = { rules, teamCount: 8, iconCount: 8, poolSize: 88, soldCount: 88, teams: full };
  assert.equal(checkCompletion(base), null);
  assert.equal(checkCompletion({ ...base, soldCount: 87 }), "PLAYERS_UNSOLD");
  assert.equal(checkCompletion({ ...base, teams: [...full.slice(1), team(900, 10)] }), "SQUADS_INCOMPLETE");
  assert.equal(checkCompletion({ ...base, teams: [...full.slice(1), team(4001, 11)] }), "BUDGET_EXCEEDED");
  assert.equal(checkCompletion({ ...base, iconCount: 7 }), "ICONS_INCOMPLETE");
});

test("status transitions", () => {
  assert.equal(transitionTarget("start", "NOT_STARTED"), "ACTIVE");
  assert.equal(transitionTarget("start", "ACTIVE"), null);
  assert.equal(transitionTarget("pause", "ACTIVE"), "PAUSED");
  assert.equal(transitionTarget("resume", "PAUSED"), "ACTIVE");
  assert.equal(transitionTarget("complete", "PAUSED"), "COMPLETED");
  assert.equal(transitionTarget("complete", "NOT_STARTED"), null);
  assert.equal(transitionTarget("resume", "COMPLETED"), null);
});
