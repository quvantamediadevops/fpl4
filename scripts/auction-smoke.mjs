#!/usr/bin/env node
/**
 * End-to-end auction test against a LOCAL preview (never production).
 * Runs a complete auction: rules, concurrency, idempotency, unsold, reversal,
 * pause, completion, live WebSocket updates and the CSV report.
 *
 *   AUCTION_URL=http://localhost:8787 AUCTION_ADMIN=name AUCTION_PASSWORD=… node scripts/auction-smoke.mjs
 *
 * The local database must be freshly migrated (status NOT_STARTED, no sales).
 */
import assert from "node:assert/strict";

const BASE = process.env.AUCTION_URL ?? "http://localhost:8787";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("Refusing to run against a non-local URL:", BASE);
  process.exit(1);
}
const ADMIN = process.env.AUCTION_ADMIN;
const PASSWORD = process.env.AUCTION_PASSWORD;
let cookie = "";
let csrf = "";
let passed = 0;
const ok = (msg) => {
  passed++;
  console.log(`  ✓ ${msg}`);
};

async function http(path, { method = "GET", body, origin = BASE, token = csrf, withCookie = true } = {}) {
  const headers = { Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["X-CSRF-Token"] = token;
  if (withCookie && cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const set = res.headers.get("set-cookie");
  if (set?.startsWith("__Host-fpl_auction=")) cookie = set.split(";")[0];
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, data: type.includes("json") ? await res.json() : await res.text() };
}
let rateLimited = 0;
async function cmd(body, opts) {
  // The room allows a burst of admin actions per 10 s; this test is faster than any person, so wait it out.
  for (;;) {
    const r = await http("/api/auction/admin/command", { method: "POST", body, ...opts });
    if (r.data?.code !== "RATE_LIMITED") return r;
    rateLimited++;
    await new Promise((res) => setTimeout(res, 2500));
  }
}
const state = async () => (await http("/api/auction/state")).data;
const key = () => crypto.randomUUID();

function liveSocket() {
  const ws = new WebSocket(BASE.replace("http", "ws") + "/api/auction/live", { headers: { Origin: BASE } });
  const messages = [];
  const waiters = [];
  ws.addEventListener("message", (e) => {
    if (e.data === "pong") return;
    const msg = JSON.parse(e.data);
    messages.push(msg);
    for (const w of waiters.splice(0)) w(msg);
  });
  const next = (pred = () => true, ms = 5000) =>
    new Promise((resolve, reject) => {
      const hit = messages.find(pred);
      if (hit) return resolve(hit);
      const t = setTimeout(() => reject(new Error("no live message")), ms);
      const check = (m) => (pred(m) ? (clearTimeout(t), resolve(m)) : waiters.push(check));
      waiters.push(check);
    });
  return { ws, messages, next, opened: new Promise((r) => ws.addEventListener("open", r)) };
}

console.log(`Auction smoke test → ${BASE}`);

// ---- Security ------------------------------------------------------------
let s = await state();
assert.equal(s.status, "NOT_STARTED", "database must be freshly migrated");
assert.equal(s.teams.length, 8);
ok("public state readable; 8 teams; NOT_STARTED");

assert.equal((await cmd({ type: "start" })).status, 401);
ok("mutation without session → 401");

assert.equal((await http("/api/auction/admin/login", { method: "POST", body: { name: ADMIN, password: "wrong" } })).status, 401);
assert.equal((await http("/api/auction/admin/login", { method: "POST", body: { name: ADMIN, password: PASSWORD }, origin: "https://evil.example" })).status, 403);
ok("wrong password → 401; foreign origin → 403");

assert.equal((await http("/api/auction/admin/login", { method: "POST", body: { name: ADMIN, password: PASSWORD } })).status, 200);
assert.ok(cookie, "session cookie set");
const page = await http("/auction/admin");
csrf = /name="auction-csrf" content="([^"]+)"/.exec(page.data)?.[1] ?? "";
assert.ok(csrf.length > 20, "csrf token rendered for the session");
assert.match(cookie, /^__Host-fpl_auction=[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/, "cookie is token.signature");
const goodCookie = cookie;
cookie = goodCookie.slice(0, -2) + (goodCookie.endsWith("A") ? "BB" : "AA"); // tampered signature
assert.equal((await http("/api/auction/admin/detail")).status, 401);
cookie = goodCookie;
assert.equal((await http("/api/auction/admin/detail")).status, 200);
ok("login sets an HMAC-signed HttpOnly session; tampered signature → 401; control room renders CSRF token");

assert.equal((await cmd({ type: "start" }, { token: "bad-token-bad-token-bad" })).status, 403);
assert.equal((await cmd({ type: "start" }, { origin: "https://evil.example" })).status, 403);
assert.equal((await cmd({ type: "drop-tables" })).status, 400);
ok("bad CSRF → 403; foreign origin → 403; unknown command → 400");

// ---- Pool and start --------------------------------------------------------
let r = await cmd({ type: "start" });
assert.equal(r.data.code, "POOL_NOT_LOADED");
r = await cmd({ type: "loadPool" });
assert.equal(r.status, 200, JSON.stringify(r.data));
s = r.data.snapshot;
assert.equal(s.counts.pool, 88);
assert.ok(s.teams.every((t) => t.icon && t.icon.name), "every team has its icon");
const iconOf = (id) => s.teams.find((t) => t.id === id).icon.name;
assert.equal(iconOf("limited-lions"), "RAJA");
assert.equal(iconOf("rkct"), "AYUSH");
// Registered players who share an icon's name are different people and stay in the auction.
const regRaja = s.players.find((p) => p.name.toLowerCase() === "raja");
const regAyush = s.players.find((p) => p.name.toLowerCase() === "ayush");
assert.ok(regRaja && regAyush, "registered Raja and Ayush are in the pool");
assert.ok(s.teams.every((t) => t.purchased === 0 && t.spent === 0 && t.remaining === 4000), "icons cost nothing");
ok(`pool loaded from registrations: ${s.counts.pool} players (incl. registered Raja & Ayush), 8 icons pre-assigned`);

const live = liveSocket();
await live.opened;
const first = await live.next((m) => m.type === "state");
assert.equal(first.snapshot.version, s.version);
ok("WebSocket connects and receives current state");

r = await cmd({ type: "start" });
assert.equal(r.data.snapshot.status, "ACTIVE");
await live.next((m) => m.snapshot?.status === "ACTIVE");
ok("auction started; presenter socket received ACTIVE");

r = await cmd({ type: "loadPool" });
assert.equal(r.data.code, "POOL_LOCKED");
ok("pool locked after start");

// ---- Sales and validation -------------------------------------------------
const teams = s.teams.map((t) => t.id);
const pool = s.players.map((p) => p.id);
let i = 0;
const nextPlayer = () => pool[i++];

let p = nextPlayer();
r = await cmd({ type: "sell", playerId: p, teamId: teams[0], price: 500, idempotencyKey: key() });
assert.equal(r.data.code, "PLAYER_NOT_SELECTED");
await cmd({ type: "select", playerId: p });
for (const [price, code] of [[99, "PRICE_BELOW_MINIMUM"], [3001, "PRICE_ABOVE_MAXIMUM"], [150.5, "PRICE_NOT_WHOLE"], [0, "PRICE_BELOW_MINIMUM"], [-500, "PRICE_BELOW_MINIMUM"]]) {
  r = await cmd({ type: "sell", playerId: p, teamId: teams[0], price, idempotencyKey: key() });
  assert.equal(r.data.code, code, `₹${price}`);
}
assert.equal((await cmd({ type: "sell", playerId: p, teamId: teams[0], price: "500", idempotencyKey: key() })).status, 400);
r = await cmd({ type: "sell", playerId: p, teamId: "not-a-team", price: 500, idempotencyKey: key() });
assert.equal(r.data.code, "TEAM_NOT_FOUND");
// Icons are not auction players: no id to select or sell.
r = await cmd({ type: "select", playerId: "raja-icon" });
assert.equal(r.data.code, "PLAYER_NOT_FOUND");
ok("rejects unselected player, ₹99, ₹3,001, ₹150.50, ₹0, negative, text price, unknown team, icon/non-pool player");

// 30 simultaneous confirmations of the same player to different teams.
const burst = await Promise.all(
  Array.from({ length: 30 }, (_, k) => cmd({ type: "sell", playerId: p, teamId: teams[k % 8], price: 2987, idempotencyKey: key() })),
);
const won = burst.filter((x) => x.status === 200);
assert.equal(won.length, 1, `exactly one sale, got ${won.length}`);
assert.ok(burst.every((x) => x.status === 200 || ["PLAYER_ALREADY_SOLD", "STATE_CHANGED", "RATE_LIMITED"].includes(x.data.code)), "losers rejected cleanly");
s = await state();
assert.equal(s.counts.sold, 1);
const buyer = s.teams.find((t) => t.purchased === 1);
assert.equal(buyer.spent, 2987);
ok("30 concurrent confirmations → exactly 1 sale (₹2,987), others rejected");

// Double-click: same idempotency key twice.
p = nextPlayer();
await cmd({ type: "select", playerId: p });
const k1 = key();
const [d1, d2] = await Promise.all([
  cmd({ type: "sell", playerId: p, teamId: teams[1], price: 1234, idempotencyKey: k1 }),
  cmd({ type: "sell", playerId: p, teamId: teams[1], price: 1234, idempotencyKey: k1 }),
]);
assert.equal(d1.status, 200);
assert.equal(d2.status, 200);
assert.equal([d1, d2].filter((x) => x.data.duplicate).length, 1);
assert.equal(d1.data.saleId, d2.data.saleId);
s = await state();
assert.equal(s.counts.sold, 2);
assert.equal(s.teams.find((t) => t.id === teams[1]).spent, 1234);
r = await cmd({ type: "sell", playerId: p, teamId: teams[2], price: 500, idempotencyKey: key() });
assert.equal(r.data.code, "PLAYER_ALREADY_SOLD");
ok("double-click (same key) → one ₹1,234 sale; selling the same player again → PLAYER_ALREADY_SOLD");

// Reserve rule on the ₹2,987 buyer: ₹1,013 left, 10 slots → max ₹113 (1,013 − 9 × 100).
const rich = buyer.id;
assert.equal(s.teams.find((t) => t.id === rich).maxNextPrice, 113);
p = nextPlayer();
await cmd({ type: "select", playerId: p });
r = await cmd({ type: "sell", playerId: p, teamId: rich, price: 114, idempotencyKey: key() });
assert.equal(r.data.code, "RESERVE_VIOLATION");
r = await cmd({ type: "sell", playerId: p, teamId: rich, price: 113, idempotencyKey: key() });
assert.equal(r.status, 200);
assert.equal(r.data.snapshot.teams.find((t) => t.id === rich).maxNextPrice, 100); // 900 − 8 × 100
ok("reserve rule: ₹114 rejected, ₹113 accepted; next max ₹100");

// Already sold.
r = await cmd({ type: "select", playerId: p });
assert.equal(r.data.code, "PLAYER_ALREADY_SOLD");
ok("sold player cannot be selected again");

// Unsold, then sold in a later round.
const u = nextPlayer();
await cmd({ type: "select", playerId: u });
r = await cmd({ type: "unsold", playerId: u });
assert.equal(r.data.snapshot.players.find((x) => x.id === u).status, "UNSOLD");
await live.next((m) => m.snapshot?.lastEvent?.type === "PLAYER_UNSOLD");
ok("player marked UNSOLD; presenter received it");

// Pause blocks sales.
await cmd({ type: "pause" });
r = await cmd({ type: "sell", playerId: u, teamId: teams[2], price: 100, idempotencyKey: key() });
assert.equal(r.data.code, "AUCTION_NOT_ACTIVE");
r = await cmd({ type: "select", playerId: u });
assert.equal(r.data.code, "AUCTION_NOT_ACTIVE");
await cmd({ type: "resume" });
ok("paused auction rejects select and sale; resumed");

await cmd({ type: "select", playerId: u });
r = await cmd({ type: "sell", playerId: u, teamId: teams[2], price: 250, idempotencyKey: key() });
assert.equal(r.status, 200);
ok("unsold player sold in a later round");

// ---- Corrections -----------------------------------------------------------
const detailNow = async () => (await http("/api/auction/admin/detail")).data;
const iconsAtStart = JSON.stringify(s.teams.map((t) => [t.id, t.icon?.name]));
const seenSales = new Set();

/** Budgets and squads recomputed independently from the sale ledger must match the server's numbers. */
async function verifyLedger(label) {
  const st = await state();
  const d = await detailNow();
  for (const x of d.sales) seenSales.add(x.saleId);
  assert.ok([...seenSales].every((id) => d.sales.some((x) => x.saleId === id)), `${label}: no sale ever disappears`);
  const liveSales = d.sales.filter((x) => !x.reversedAt);
  for (const t of st.teams) {
    const mine = liveSales.filter((x) => x.teamId === t.id);
    const spent = mine.reduce((a, x) => a + x.price, 0);
    assert.equal(t.spent, spent, `${label}: ${t.id} spent`);
    assert.equal(t.purchased, mine.length, `${label}: ${t.id} purchased`);
    assert.equal(t.remaining, 4000 - spent, `${label}: ${t.id} remaining`);
    assert.ok(t.remaining >= 0 && t.remaining <= 4000 && t.purchased <= 11, `${label}: ${t.id} within limits`);
    assert.ok(t.remaining - Math.max(0, t.slotsLeft) * 100 >= 0, `${label}: ${t.id} can still fill its squad`);
  }
  const perPlayer = new Map();
  for (const x of liveSales) perPlayer.set(x.playerId, (perPlayer.get(x.playerId) ?? 0) + 1);
  assert.ok([...perPlayer.values()].every((n) => n === 1), `${label}: one live sale per player`);
  for (const p of st.players) {
    const sale = liveSales.find((x) => x.playerId === p.id);
    if (p.status === "SOLD") assert.ok(sale && sale.teamId === p.teamId && sale.price === p.price, `${label}: ${p.name} matches its live sale`);
    else assert.ok(!sale && p.teamId === null && p.price === null, `${label}: ${p.name} has no live sale`);
  }
  assert.equal(JSON.stringify(st.teams.map((t) => [t.id, t.icon?.name])), iconsAtStart, `${label}: icons unchanged`);
  return { st, d };
}

const T = (i) => teams[i];
const teamOf = (st, id) => st.teams.find((t) => t.id === id);
const correct = (saleId, teamId, price, reason = "Anchor confirmed the correct result", k = key(), opts) =>
  cmd({ type: "correct", saleId, teamId, price, reason, idempotencyKey: k }, opts);
await verifyLedger("before corrections");

// 1. Change price ₹1,200 → ₹1,000 (same team).
const rahul = nextPlayer();
await cmd({ type: "select", playerId: rahul });
r = await cmd({ type: "sell", playerId: rahul, teamId: T(3), price: 1200, idempotencyKey: key() });
assert.equal(r.status, 200);
const sale1 = r.data.saleId;
let before = await state();
r = await correct(sale1, T(3), 1000, "Anchor confirmed ₹1,000, not ₹1,200");
assert.equal(r.status, 200, JSON.stringify(r.data));
const sale2 = r.data.saleId;
assert.notEqual(sale2, sale1);
assert.equal(teamOf(r.data.snapshot, T(3)).spent, teamOf(before, T(3)).spent - 200);
assert.equal(teamOf(r.data.snapshot, T(3)).purchased, teamOf(before, T(3)).purchased);
await live.next((m) => m.snapshot?.lastEvent?.type === "SALE_CORRECTED" && m.snapshot.lastEvent.amount === 1000);
let { d } = await verifyLedger("price change");
assert.ok(d.sales.find((x) => x.saleId === sale1 && x.reversedAt && x.reversalReason.startsWith("Corrected:")));
assert.ok(d.corrections.find((c) => c.action === "CHANGE_PRICE" && c.originalSaleId === sale1 && c.replacementSaleId === sale2 && c.fromPrice === 1200 && c.toPrice === 1000));
ok("1. change price ₹1,200 → ₹1,000: original reversed and kept, replacement recorded, budget −₹200, presenter notified");

// 2. Change team only.
before = await state();
r = await correct(sale2, T(4), 1000, "Wrong team entered — STAR XI won");
assert.equal(r.status, 200, JSON.stringify(r.data));
const sale3 = r.data.saleId;
let after = r.data.snapshot;
assert.equal(teamOf(after, T(3)).spent, teamOf(before, T(3)).spent - 1000);
assert.equal(teamOf(after, T(3)).purchased, teamOf(before, T(3)).purchased - 1);
assert.equal(teamOf(after, T(4)).spent, teamOf(before, T(4)).spent + 1000);
assert.equal(teamOf(after, T(4)).purchased, teamOf(before, T(4)).purchased + 1);
assert.equal(after.players.find((x) => x.id === rahul).status, "SOLD");
assert.equal(after.players.find((x) => x.id === rahul).teamId, T(4));
await verifyLedger("team change");
ok("2. change team: original team gets ₹1,000 and a slot back, new team charged, player stays SOLD");

// 3. Change team and price.
r = await correct(sale3, T(5), 1500, "Final bid was ₹1,500 from another team");
assert.equal(r.status, 200, JSON.stringify(r.data));
const sale4 = r.data.saleId;
({ d } = await verifyLedger("team + price"));
assert.equal(d.corrections.find((c) => c.replacementSaleId === sale4).action, "CHANGE_PRICE_TEAM");
ok("3. change team and price together");

// Corrections of a replaced sale, or with no change, are refused.
assert.equal((await correct(sale1, T(5), 900)).data.code, "SALE_NOT_ACTIVE");
assert.equal((await correct(sale4, T(5), 1500)).data.code, "NO_CHANGE");

// 9–12. Price bounds, paise and reason.
for (const [price, code] of [[99, "PRICE_BELOW_MINIMUM"], [3001, "PRICE_ABOVE_MAXIMUM"], [1000.5, "PRICE_NOT_WHOLE"]]) {
  assert.equal((await correct(sale4, T(5), price)).data.code, code, `₹${price}`);
}
assert.equal((await correct(sale4, T(5), 1400, "")).data.code, "REASON_REQUIRED");
assert.equal((await correct(sale4, T(5), 1400, "abc")).data.code, "REASON_REQUIRED");
assert.equal((await cmd({ type: "correct", saleId: sale4, teamId: T(5), price: 1400, idempotencyKey: key() })).status, 400);
ok("9–12. corrections reject ₹99, ₹3,001, ₹1,000.50, missing/short reason; nothing changed");

// 7–8. Insufficient budget and reserve on the target team (rich: ₹900 left, 9 slots → max ₹100).
assert.equal(teamOf(await state(), rich).remaining, 900);
assert.equal((await correct(sale4, rich, 1000)).data.code, "INSUFFICIENT_BUDGET");
assert.equal((await correct(sale4, rich, 200)).data.code, "RESERVE_VIOLATION");
await verifyLedger("after rejected corrections");
ok("7–8. correction to a team without budget / reserve is rejected with the reason");

// 13. Unauthenticated / forged correction.
const realCookie = cookie;
cookie = "";
assert.equal((await correct(sale4, T(5), 1400)).status, 401);
cookie = realCookie;
assert.equal((await correct(sale4, T(5), 1400, undefined, key(), { token: "bad-token-bad-token-bad" })).status, 403);
assert.equal((await correct(sale4, T(5), 1400, undefined, key(), { origin: "https://evil.example" })).status, 403);
ok("13. corrections need a session, the CSRF token and this site's origin");

// 14. Duplicate submissions (same key twice at once, then again).
const dupKey = key();
const dups = await Promise.all([correct(sale4, T(5), 1400, "Double-click test", dupKey), correct(sale4, T(5), 1400, "Double-click test", dupKey)]);
assert.ok(dups.every((x) => x.status === 200));
assert.equal(dups.filter((x) => x.data.duplicate).length, 1);
assert.equal(dups[0].data.saleId, dups[1].data.saleId);
const sale5 = dups[0].data.saleId;
assert.equal((await correct(sale4, T(5), 1400, "Double-click test", dupKey)).data.duplicate, true);
assert.equal((await correct(sale5, T(5), 1300, "Same key, other change", dupKey)).data.code, "IDEMPOTENCY_CONFLICT");
({ d } = await verifyLedger("duplicates"));
assert.equal(d.corrections.filter((c) => c.originalSaleId === sale4).length, 1);
ok("14. duplicate correction submissions apply once; key reuse for a different change is refused");

// 4. Undo sale → UNSOLD.
before = await state();
const undoKey = key();
const undos = await Promise.all([cmd({ type: "undo", saleId: sale5, reason: "Auctioneer declared it unsold", idempotencyKey: undoKey }), cmd({ type: "undo", saleId: sale5, reason: "Auctioneer declared it unsold", idempotencyKey: undoKey })]);
assert.ok(undos.every((x) => x.status === 200));
assert.equal(undos.filter((x) => x.data.duplicate).length, 1);
after = await state();
assert.equal(after.players.find((x) => x.id === rahul).status, "UNSOLD");
assert.equal(after.players.find((x) => x.id === rahul).teamId, null);
assert.equal(after.counts.sold, before.counts.sold - 1);
assert.equal(teamOf(after, T(5)).spent, teamOf(before, T(5)).spent - 1400);
assert.equal(teamOf(after, T(5)).purchased, teamOf(before, T(5)).purchased - 1);
await live.next((m) => m.snapshot?.lastEvent?.type === "SALE_REVERSED");
assert.equal((await cmd({ type: "undo", saleId: sale5, reason: "Again please", idempotencyKey: key() })).data.code, "SALE_NOT_ACTIVE");
assert.equal((await cmd({ type: "undo", saleId: sale5, reason: "", idempotencyKey: key() })).data.code, "REASON_REQUIRED");
await verifyLedger("undo");
ok("4. undo sale → UNSOLD: team restored, active sales −1, presenter notified, duplicate applied once, cannot undo twice");

// 5. Reopen UNSOLD → AVAILABLE.
assert.equal((await cmd({ type: "reopen", playerId: rahul, reason: "x", idempotencyKey: key() })).data.code, "REASON_REQUIRED");
const reopenKey = key();
const reopens = await Promise.all([cmd({ type: "reopen", playerId: rahul, reason: "Second round for unsold players", idempotencyKey: reopenKey }), cmd({ type: "reopen", playerId: rahul, reason: "Second round for unsold players", idempotencyKey: reopenKey })]);
assert.ok(reopens.every((x) => x.status === 200));
assert.equal((await state()).players.find((x) => x.id === rahul).status, "AVAILABLE");
assert.equal((await cmd({ type: "reopen", playerId: rahul, reason: "Not unsold any more", idempotencyKey: key() })).data.code, "PLAYER_NOT_UNSOLD");
await live.next((m) => m.snapshot?.lastEvent?.type === "PLAYER_REOPENED");
({ d } = await verifyLedger("reopen"));
assert.equal(d.corrections.filter((c) => c.action === "REOPEN_PLAYER" && c.playerId === rahul).length, 1);
assert.ok(d.events.some((e) => e.type === "SALE_REVERSED" && e.playerId === rahul), "UNSOLD history kept");
ok("5. reopen UNSOLD → AVAILABLE once (duplicate ignored), history kept, presenter notified");

// 6. Re-sell a previously reversed player.
await cmd({ type: "select", playerId: rahul });
r = await cmd({ type: "sell", playerId: rahul, teamId: T(6), price: 777, idempotencyKey: key() });
assert.equal(r.status, 200, JSON.stringify(r.data));
const sale6 = r.data.saleId;
({ d } = await verifyLedger("re-sell"));
assert.equal(d.sales.filter((x) => x.playerId === rahul).length, 6); // 1,200 → 1,000 → team → team+price → dup-corrected → re-sold
assert.equal(d.sales.filter((x) => x.playerId === rahul && !x.reversedAt).length, 1);
ok("6. a reversed player can be sold again; all 6 of their sale records are kept, exactly 1 live");

// 18. Concurrent correction + sale competing for the same team budget: exactly one may win.
const emptyTeam = (await state()).teams.find((t) => t.purchased === 0 && t.id !== rich);
assert.ok(emptyTeam, "a team with no purchases");
const other = nextPlayer();
await cmd({ type: "select", playerId: other });
const race = await Promise.all([
  correct(sale6, emptyTeam.id, 2000, "Race test: correction"),
  cmd({ type: "sell", playerId: other, teamId: emptyTeam.id, price: 3000, idempotencyKey: key() }),
]);
assert.equal(race.filter((x) => x.status === 200).length, 1, `exactly one wins: ${race.map((x) => x.data.code ?? "ok").join(",")}`);
assert.ok(teamOf(await state(), emptyTeam.id).spent <= 4000);
await verifyLedger("race correction vs sale");
// Two different corrections of the same sale at once: exactly one applies.
const liveRahul = (await detailNow()).sales.find((x) => x.playerId === rahul && !x.reversedAt);
const roomy = (await state()).teams.filter((t) => t.slotsLeft > 1).sort((a, b) => b.maxNextPrice - a.maxNextPrice)[0];
const race2 = await Promise.all([correct(liveRahul.saleId, roomy.id, 101, "Race test A"), correct(liveRahul.saleId, roomy.id, 102, "Race test B")]);
assert.equal(race2.filter((x) => x.status === 200).length, 1);
await verifyLedger("race correction vs correction");
ok("18. concurrent correction + sale on one budget, and two corrections of one sale: exactly one applies each time");

// 15. Audit history preserved.
({ d } = await verifyLedger("audit"));
const types = new Set(d.events.map((e) => e.type));
for (const t of ["PLAYER_SOLD", "SALE_CORRECTED", "SALE_REVERSED", "PLAYER_REOPENED"]) assert.ok(types.has(t), `event ${t}`);
assert.ok(d.corrections.length >= 6);
ok(`15. audit kept: ${d.sales.length} sale records (${d.sales.filter((x) => x.reversedAt).length} reversed), ${d.corrections.length} corrections`);

// Reports distinguish original / reversed / corrected / active.
const csvMid = (await http("/api/auction/admin/report")).data;
for (const label of ["SALE HISTORY", "ORIGINAL SALE", "CORRECTED SALE", "REVERSED · CORRECTED", "REVERSED · UNDONE", "ACTIVE · CORRECTED SALE", "REOPENED PLAYERS"]) {
  assert.ok(csvMid.includes(label), `report shows ${label}`);
}
ok("report distinguishes original, reversed (corrected / undone), corrected and active sales, and reopened players");

// Completion blocked while incomplete.
r = await cmd({ type: "complete" });
assert.equal(r.data.code, "PLAYERS_UNSOLD");
ok("completion blocked with unsold players / incomplete squads");

// ---- Finish the auction ----------------------------------------------------
// A team with no slots left must be refused.
s = await state();
let remaining = s.players.filter((x) => x.status !== "SOLD").map((x) => x.id);
let checkedFull = false;
for (const pid of remaining) {
  const open = s.teams.filter((t) => t.slotsLeft > 0);
  const t = open[Math.floor(Math.random() * open.length)];
  const price = 100 + Math.floor(Math.random() * (t.maxNextPrice - 100 + 1)); // any whole rupee up to the team's maximum
  await cmd({ type: "select", playerId: pid });
  const full = s.teams.find((x) => x.slotsLeft === 0);
  if (full && !checkedFull) {
    // A team with no slots left must be refused.
    const rf = await cmd({ type: "sell", playerId: pid, teamId: full.id, price: 100, idempotencyKey: key() });
    assert.equal(rf.data.code, "TEAM_FULL");
    checkedFull = true;
  }
  r = await cmd({ type: "sell", playerId: pid, teamId: t.id, price, idempotencyKey: key() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  s = r.data.snapshot;
}
assert.ok(checkedFull, "full-team rejection exercised");
s = await state();
assert.equal(s.counts.sold, 88);
assert.ok(s.teams.every((t) => t.purchased === 11 && t.spent <= 4000 && t.remaining >= 0 && t.icon));
assert.equal(s.players.find((x) => x.id === regRaja.id).status, "SOLD");
assert.equal(s.players.find((x) => x.id === regAyush.id).status, "SOLD");
assert.equal(s.counts.spent, s.teams.reduce((a, t) => a + t.spent, 0));
ok(`all 88 sold (incl. registered Raja & Ayush); every team 11 + icon = 12; spend ${s.teams.map((t) => t.spent).join("/")}`);

r = await cmd({ type: "complete" });
assert.equal(r.data.snapshot.status, "COMPLETED");
await live.next((m) => m.snapshot?.status === "COMPLETED");
for (const c of [
  { type: "undo", saleId: s.recent[0].saleId, reason: "Too late now", idempotencyKey: key() },
  { type: "correct", saleId: s.recent[0].saleId, teamId: s.recent[0].teamId, price: 101, reason: "Too late now", idempotencyKey: key() },
  { type: "reopen", playerId: s.players[0].id, reason: "Too late now", idempotencyKey: key() },
]) {
  r = await cmd(c);
  assert.ok(["AUCTION_CLOSED", "PLAYER_NOT_UNSOLD"].includes(r.data.code), `${c.type} after completion: ${r.data.code}`);
}
({ d } = await verifyLedger("completed"));
assert.ok(s.teams.every((t) => t.purchased === 11 && t.remaining >= 0 && t.spent <= 4000));
ok(`auction completed; presenter received it; corrections closed; all 8 budgets reconcile with ${d.sales.length} sale records`);

// Reconnect: a new socket gets the latest authoritative state.
live.ws.close();
const again = liveSocket();
const fresh = await again.next((m) => m.type === "state");
assert.equal(fresh.snapshot.status, "COMPLETED");
assert.equal(fresh.snapshot.version, (await state()).version);
again.ws.close();
ok("reconnect delivers the latest state");

const csv = await http("/api/auction/admin/report");
assert.equal(csv.status, 200);
const lines = csv.data.trim().split(/\r\n/);
assert.equal(lines.filter((l) => /,ICON,/.test(l)).length, 8);
assert.equal(lines.filter((l) => /^[^,]+,([1-9]|10|11),/.test(l)).length, 88);
ok("CSV report: 8 icons + 88 purchases");

// Logout ends the session.
await http("/api/auction/admin/logout", { method: "POST" });
assert.equal((await cmd({ type: "pause" })).status, 401);
ok("logout revokes the session");

// Login rate limiting (6 failures per 15 minutes per IP).
cookie = "";
let last = 0;
for (let n = 0; n < 7; n++) last = (await http("/api/auction/admin/login", { method: "POST", body: { name: ADMIN, password: "nope" } })).status;
assert.equal(last, 429);
ok("repeated failed logins → 429");

console.log(`\n${passed} checks passed. (rate limiter paused this test ${rateLimited} times)`);
process.exit(0);
