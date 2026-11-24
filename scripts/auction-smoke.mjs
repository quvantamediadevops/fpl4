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
ok(`pool loaded from registrations: ${s.counts.pool} players (incl. registered Raja & Ayush), 8 icons pre-assigned at ₹0`);

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
const reSale = r.data.saleId;
ok("unsold player sold in a later round");

// Reversal restores budget and slot; player returns to UNSOLD (was unsold before).
const before = (await state()).teams.find((t) => t.id === teams[2]);
r = await cmd({ type: "reverse", saleId: reSale, reason: "" });
assert.equal(r.data.code, "REASON_REQUIRED");
r = await cmd({ type: "reverse", saleId: reSale, reason: "Wrong team entered" });
assert.equal(r.status, 200);
s = r.data.snapshot;
const after = s.teams.find((t) => t.id === teams[2]);
assert.equal(after.spent, before.spent - 250);
assert.equal(after.purchased, before.purchased - 1);
assert.equal(s.players.find((x) => x.id === u).status, "UNSOLD");
r = await cmd({ type: "reverse", saleId: reSale, reason: "Again please" });
assert.equal(r.data.code, "ALREADY_REVERSED");
const detail = (await http("/api/auction/admin/detail")).data;
assert.ok(detail.sales.find((x) => x.saleId === reSale && x.reversedAt && x.reversalReason === "Wrong team entered"));
assert.ok(detail.events.some((e) => e.type === "SALE_REVERSED"));
ok("reversal needs a reason, restores budget/slot, keeps the sale record, logs it; cannot repeat");

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
r = await cmd({ type: "reverse", saleId: s.recent[0].saleId, reason: "Too late now" });
assert.equal(r.data.code, "INVALID_TRANSITION");
ok("auction completed; presenter received it; no corrections after completion");

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
