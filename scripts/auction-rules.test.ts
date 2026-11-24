// Auction rule tests. Run: npm run test:auction
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkCompletion,
  checkCorrection,
  checkSale,
  checkStart,
  correctionAction,
  correctionLedger,
  teamPosition,
  transitionTarget,
  validReason,
  type AuctionRules,
  type CorrectionCheckInput,
  type SaleCheckInput,
} from "../src/auction/rules.ts";

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

// ---- Corrections -----------------------------------------------------------

const correction = (over: Partial<CorrectionCheckInput> = {}): CorrectionCheckInput => ({
  rules,
  status: "ACTIVE",
  sale: { teamId: "msct", price: 1200, active: true },
  target: { id: "msct", ...team(1200, 1) },
  price: 1000,
  ...over,
});

test("correct price ₹1,200 → ₹1,000 on the same team (the original sale is freed first)", () => {
  assert.equal(checkCorrection(correction()), null);
  assert.equal(correctionAction({ teamId: "msct", price: 1200 }, { teamId: "msct", price: 1000 }), "CHANGE_PRICE");
  // Same team: the ledger drops the original ₹1,200 and its slot before applying the new price.
  assert.deepEqual(correctionLedger(correction()), { initialBudget: 4000, spent: 0, purchased: 0 });
});

test("raise price on the same team up to the full ₹3,000 when the team only has this player", () => {
  assert.equal(checkCorrection(correction({ price: 3000 })), null);
  assert.equal(checkCorrection(correction({ price: 3001 })), "PRICE_ABOVE_MAXIMUM");
});

test("change team only / team and price", () => {
  const starXi = { id: "star-xi", ...team(0, 0) };
  assert.equal(checkCorrection(correction({ target: starXi, price: 1200 })), null);
  assert.equal(correctionAction({ teamId: "msct", price: 1200 }, { teamId: "star-xi", price: 1200 }), "CHANGE_TEAM");
  assert.equal(checkCorrection(correction({ target: starXi, price: 1500 })), null);
  assert.equal(correctionAction({ teamId: "msct", price: 1200 }, { teamId: "star-xi", price: 1500 }), "CHANGE_PRICE_TEAM");
  // A different team is checked on its own ledger, unchanged.
  assert.deepEqual(correctionLedger(correction({ target: starXi })), { initialBudget: 4000, spent: 0, purchased: 0 });
});

test("no change is rejected", () => {
  assert.equal(checkCorrection(correction({ price: 1200 })), "NO_CHANGE");
  assert.equal(correctionAction({ teamId: "msct", price: 1200 }, { teamId: "msct", price: 1200 }), null);
});

test("correction to a team with too little budget or reserve is rejected", () => {
  // Target spent ₹3,100 on 2 players: ₹900 left, 9 slots → max ₹100.
  const poor = { id: "rkct", ...team(3100, 2) };
  assert.equal(checkCorrection(correction({ target: poor, price: 1000 })), "INSUFFICIENT_BUDGET");
  assert.equal(checkCorrection(correction({ target: poor, price: 200 })), "RESERVE_VIOLATION");
  assert.equal(checkCorrection(correction({ target: poor, price: 100 })), null);
});

test("same-team correction respects reserve after freeing the original", () => {
  // 10 bought for ₹3,950 incl. this ₹1,200 sale; freeing it: ₹2,750 spent, 9 bought, 2 slots → max ₹1,150.
  const t = { id: "msct", ...team(3950, 10) };
  assert.equal(teamPosition(rules, correctionLedger(correction({ target: t }))!).maxNextPrice, 1150);
  assert.equal(checkCorrection(correction({ target: t, price: 1150 })), null);
  assert.equal(checkCorrection(correction({ target: t, price: 1151 })), "RESERVE_VIOLATION");
});

test("correction to a full team is rejected; the original team is never 'full' for its own sale", () => {
  const full = { id: "myct", ...team(1100, 11) };
  assert.equal(checkCorrection(correction({ target: full, price: 100 })), "TEAM_FULL");
  const ownFull = { id: "msct", ...team(2200, 11) };
  assert.equal(checkCorrection(correction({ sale: { teamId: "msct", price: 1200, active: true }, target: ownFull, price: 1100 })), null);
});

test("price bounds and paise apply to corrections", () => {
  assert.equal(checkCorrection(correction({ price: 99 })), "PRICE_BELOW_MINIMUM");
  assert.equal(checkCorrection(correction({ price: 100 })), null);
  assert.equal(checkCorrection(correction({ price: 1000.5 })), "PRICE_NOT_WHOLE");
  assert.equal(checkCorrection(correction({ price: Number.NaN })), "PRICE_NOT_WHOLE");
});

test("only live sales, only while the auction is running or paused", () => {
  assert.equal(checkCorrection(correction({ sale: { teamId: "msct", price: 1200, active: false } })), "SALE_NOT_ACTIVE");
  assert.equal(checkCorrection(correction({ sale: null })), "SALE_NOT_ACTIVE");
  assert.equal(checkCorrection(correction({ status: "PAUSED" })), null);
  assert.equal(checkCorrection(correction({ status: "COMPLETED" })), "AUCTION_CLOSED");
  assert.equal(checkCorrection(correction({ status: "NOT_STARTED" })), "AUCTION_CLOSED");
  assert.equal(checkCorrection(correction({ target: null })), "TEAM_NOT_FOUND");
});

test("a correction reason is mandatory (5–300 characters)", () => {
  for (const r of [undefined, null, "", "    ", "abcd", "x".repeat(301)]) assert.equal(validReason(r), false);
  assert.equal(validReason("Wrong team"), true);
  assert.equal(validReason("  Anchor confirmed ₹1,000  "), true);
});

test("random corrections never break a team's budget or reserve (10k)", () => {
  for (let run = 0; run < 10_000; run++) {
    const purchased = 1 + Math.floor(Math.random() * 11);
    const salePrice = 100 + Math.floor(Math.random() * 2901);
    // Build a valid ledger that contains this sale.
    const others = purchased - 1;
    const othersSpent = others * 100 + Math.floor(Math.random() * Math.max(0, 4000 - salePrice - (11 - purchased) * 100 - others * 100 + 1));
    const t = { id: "msct", initialBudget: 4000, spent: salePrice + othersSpent, purchased };
    if (t.spent + (11 - purchased) * 100 > 4000) continue;
    const price = 1 + Math.floor(Math.random() * 3100);
    const input = correction({ sale: { teamId: "msct", price: salePrice, active: true }, target: t, price });
    if (checkCorrection(input) === null) {
      const after = { initialBudget: 4000, spent: othersSpent + price, purchased };
      assert.ok(after.spent + (11 - purchased) * 100 <= 4000, "reserve kept");
      assert.ok(price >= 100 && price <= 3000);
    }
  }
});

// ---- HARD RESET contract -----------------------------------------------------------
import { REQUEST_ID, RESET_PHRASE, phraseMatches, resetEnvironment, superAdminNames } from "../src/auction/reset.ts";

test("reset phrase must match exactly", () => {
  assert.equal(phraseMatches(RESET_PHRASE), true);
  for (const v of [RESET_PHRASE.toLowerCase(), `${RESET_PHRASE} `, ` ${RESET_PHRASE}`, "RESET FPL SEASON 4", "RESET  FPL SEASON 4 AUCTION", "", null, undefined, 4]) {
    assert.equal(phraseMatches(v), false, String(v));
  }
});

test("only local preview hosts count as LOCAL", () => {
  for (const u of ["http://localhost:8787/x", "http://127.0.0.1:8787/", "http://[::1]:8787/", "http://fpl.localhost/"]) assert.equal(resetEnvironment(u), "LOCAL", u);
  for (const u of ["https://cricket.deeptiranjan.com/", "https://fpl4.example.workers.dev/", "https://localhost.evil.com/", "not a url"]) assert.equal(resetEnvironment(u), "PRODUCTION", u);
});

test("super-admin list: empty means nobody; names normalised; junk ignored", () => {
  assert.equal(superAdminNames(undefined).size, 0);
  assert.equal(superAdminNames("").size, 0);
  assert.deepEqual([...superAdminNames(" Deepti, ops-lead;x  bad name! ")].sort(), ["bad", "deepti", "ops-lead"]);
  assert.ok(REQUEST_ID.test(crypto.randomUUID()));
  assert.ok(!REQUEST_ID.test("not-a-uuid"));
});
