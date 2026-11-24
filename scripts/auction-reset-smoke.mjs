#!/usr/bin/env node
/**
 * HARD RESET end-to-end test against a LOCAL preview (refuses any other URL).
 *
 *   AUCTION_URL=http://localhost:8787 AUCTION_ADMIN=<super-admin> AUCTION_PASSWORD=… \
 *   AUCTION_OPERATOR=<non-super admin> AUCTION_OPERATOR_PASSWORD=… RESET_MODE=main1 node scripts/auction-reset-smoke.mjs
 *
 * RESET_MODE: main1 (security + scenarios 1-8, duplicates, cooldown, live sync),
 *             main2 (completed auction, concurrent resets, accounts and Google Sheets after reset),
 *             fault-backup / fault-database (preview started with AUCTION_RESET_FAULT=backup|database).
 * main1 needs a freshly migrated local database.
 */
import assert from "node:assert/strict";

const BASE = process.env.AUCTION_URL ?? "http://localhost:8787";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("Refusing to run against a non-local URL:", BASE);
  process.exit(1);
}
const MODE = process.env.RESET_MODE ?? "main1";
const PHRASE = "RESET FPL SEASON 4 AUCTION";
const ICONS = { msct: "SONU", "star-xi": "AJIT (AJU)", iconic: "RABI", "limited-lions": "RAJA", rkct: "AYUSH", "royal-boyzz": "SINKU", myct: "VIJAY (BIJU)", bajarangmonks: "SACHIN" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => crypto.randomUUID();
let passed = 0;
const ok = (msg) => {
  passed++;
  console.log(`  ✓ ${msg}`);
};

class Session {
  cookie = "";
  csrf = "";
  constructor(name, password) {
    this.name = name;
    this.password = password;
  }
  async http(path, { method = "GET", body, origin = BASE, token = this.csrf, withCookie = true } = {}) {
    const headers = { Origin: origin };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["X-CSRF-Token"] = token;
    if (withCookie && this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    const set = res.headers.get("set-cookie");
    if (set?.startsWith("__Host-fpl_auction=")) this.cookie = set.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    return { status: res.status, data: type.includes("json") ? await res.json() : await res.text() };
  }
  async login() {
    const r = await this.http("/api/auction/admin/login", { method: "POST", body: { name: this.name, password: this.password } });
    assert.equal(r.status, 200, `login ${this.name}: ${JSON.stringify(r.data)}`);
    const page = await this.http("/auction/admin");
    this.csrf = /name="auction-csrf" content="([^"]+)"/.exec(page.data)?.[1] ?? "";
    assert.ok(this.csrf.length > 20);
    return page.data;
  }
  async cmd(body) {
    for (;;) {
      const r = await this.http("/api/auction/admin/command", { method: "POST", body });
      if (r.data?.code !== "RATE_LIMITED") return r;
      await sleep(2500);
    }
  }
  reset(over = {}, opts = {}) {
    return this.http("/api/auction/admin/reset", { method: "POST", body: { requestId: key(), phrase: PHRASE, acknowledged: true, ...over }, ...opts });
  }
}

const SUPER = new Session(process.env.AUCTION_ADMIN, process.env.AUCTION_PASSWORD);
const OPERATOR = new Session(process.env.AUCTION_OPERATOR, process.env.AUCTION_OPERATOR_PASSWORD);
const state = async () => (await fetch(BASE + "/api/auction/state")).json();
const detail = async () => (await SUPER.http("/api/auction/admin/detail")).data;

let lastResetAt = 0;
async function doReset(label, before) {
  const wait = 5200 - (Date.now() - lastResetAt);
  if (wait > 0) await sleep(wait); // server-side cooldown between resets
  const requestId = key();
  const r = await SUPER.reset({ requestId });
  lastResetAt = Date.now();
  assert.equal(r.status, 200, `${label}: ${JSON.stringify(r.data)}`);
  assert.equal(r.data.ok, true);
  await verifyFresh(label, before, r.data);
  return { requestId, res: r.data };
}

/** Independent checks of the post-reset state, the admin history and the stored backup. */
async function verifyFresh(label, before, res) {
  const s = await state();
  assert.equal(s.status, "NOT_STARTED");
  assert.equal(s.currentPlayerId, null);
  assert.equal(s.teams.length, 8);
  for (const t of s.teams) {
    assert.equal(t.remaining, 4000, `${t.name} budget`);
    assert.equal(t.spent, 0);
    assert.equal(t.purchased, 0);
    assert.equal(t.slotsLeft, 11);
    assert.equal(t.players.length, 0);
    assert.equal(t.icon?.name, ICONS[t.id], `${t.name} icon`);
  }
  assert.equal(s.counts.sold, 0);
  assert.equal(s.counts.unsold, 0);
  assert.equal(s.counts.available, s.counts.pool);
  assert.ok(s.players.every((p) => p.status === "AVAILABLE" && p.teamId === null && p.price === null && p.unsoldCount === 0));
  assert.equal(s.recent.length, 0);
  assert.equal(s.lastEvent, null);
  assert.equal(s.resetEpoch, before.state.resetEpoch + 1, "reset epoch advanced");
  assert.ok(s.version > before.state.version, "version keeps increasing");
  const d = await detail();
  assert.equal(d.sales.length, 0);
  assert.equal(d.corrections.length, 0);
  assert.equal(d.events.length, 0);
  // Backup: downloadable by the super-admin only, checksum and contents match the pre-reset state.
  const b = res.reset.backup;
  const dl = await SUPER.http(`/api/auction/admin/reset-backups/${b.id}`);
  assert.equal(dl.status, 200);
  const text = typeof dl.data === "string" ? dl.data : JSON.stringify(dl.data);
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  assert.equal(sha, b.sha256, "backup checksum");
  const json = JSON.parse(text);
  assert.equal(json.tables.auction_sales.length, before.detail.sales.length, "backup sales");
  assert.equal(json.tables.auction_corrections.length, before.detail.corrections.length, "backup corrections");
  assert.ok(json.tables.auction_events.length >= Math.min(120, before.detail.events.length), "backup events");
  assert.equal(json.tables.auction_players.length, before.state.counts.pool, "backup players");
  assert.ok(!/csrf|token_hash|pbkdf2|password/i.test(text), "backup holds no secrets");
  ok(`${label}: fresh state verified (8 teams ₹4,000, 0/11, icons kept, ${s.counts.pool} AVAILABLE, no sales/corrections/events, NOT_STARTED); backup ${b.id} verified (${b.rows.auction_sales} sales, ${b.rows.auction_corrections} corrections)`);
  return s;
}
const capture = async () => ({ state: await state(), detail: await detail() });
const nextPlayer = (s) => s.players.find((p) => p.status === "AVAILABLE") ?? s.players.find((p) => p.status === "UNSOLD");
async function sell(teamId, price) {
  const p = nextPlayer(await state());
  assert.equal((await SUPER.cmd({ type: "select", playerId: p.id })).status, 200);
  const r = await SUPER.cmd({ type: "sell", playerId: p.id, teamId, price, idempotencyKey: key() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { player: p, saleId: r.data.saleId };
}
const liveSale = async (playerId) => (await detail()).sales.find((x) => x.playerId === playerId && !x.reversedAt);

console.log(`HARD RESET test (${MODE}) → ${BASE}`);
const superPage = await SUPER.login();
await OPERATOR.login();

if (MODE === "main1") {
  // ---- Security: nothing below may change the auction --------------------------------------------
  assert.ok(superPage.includes("DANGER ZONE") && superPage.includes("HARD RESET AUCTION"));
  const opPage = await OPERATOR.http("/auction/admin");
  assert.ok(!opPage.data.includes("DANGER ZONE") && !opPage.data.includes("HARD RESET AUCTION"));
  ok("Danger Zone rendered for the super-admin only");
  const v0 = (await state()).version;
  const anon = new Session("x", "x");
  assert.equal((await anon.reset({}, { withCookie: false, token: "" })).status, 401);
  ok("12 unauthenticated → 401");
  const op = await OPERATOR.reset();
  assert.equal(op.status, 403);
  assert.equal(op.data.code, "FORBIDDEN");
  ok("13 authenticated non-super admin → 403 FORBIDDEN");
  assert.equal((await SUPER.reset({}, { token: "invalid-csrf-token-value" })).status, 403);
  assert.equal((await SUPER.reset({}, { token: "" })).status, 403);
  ok("14 invalid / missing CSRF token → 403");
  assert.equal((await SUPER.reset({}, { origin: "https://evil.example" })).status, 403);
  ok("15 foreign origin → 403");
  for (const phrase of ["reset fpl season 4 auction", "RESET FPL SEASON 4", `${PHRASE} `, ` ${PHRASE}`, "RESET  FPL SEASON 4 AUCTION", "", null]) {
    const r = await SUPER.reset({ phrase });
    assert.equal(r.status, 400, String(phrase));
    assert.equal(r.data.code, "PHRASE_MISMATCH");
  }
  ok("10 wrong case, partial, padded, double-spaced, empty and missing phrases → 400 PHRASE_MISMATCH");
  for (const acknowledged of [false, undefined, "true", 1]) {
    const r = await SUPER.reset({ acknowledged });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, "CONFIRMATION_REQUIRED");
  }
  ok("11 unchecked / missing / non-boolean confirmation → 400 CONFIRMATION_REQUIRED");
  assert.equal((await SUPER.reset({ requestId: "not-a-uuid" })).status, 400);
  assert.equal((await SUPER.http("/api/auction/admin/reset")).status, 405);
  ok("invalid request id → 400; GET /api/auction/admin/reset → 405");
  assert.equal((await OPERATOR.http("/api/auction/admin/reset-backups/bk-20260101T000000Z-00000000")).status, 403);
  assert.equal((await anon.http("/api/auction/admin/reset-backups/bk-20260101T000000Z-00000000", { withCookie: false })).status, 401);
  ok("backup download: anonymous → 401, non-super admin → 403");
  assert.equal((await state()).version, v0);
  ok("none of the refused requests changed the auction (version unchanged)");

  // ---- 1. fresh auction ---------------------------------------------------------------------------
  await doReset("1 fresh auction (no pool yet)", await capture());

  // ---- 20. live sync: a connected screen receives AUCTION_RESET --------------------------------------
  assert.equal((await SUPER.cmd({ type: "loadPool" })).status, 200);
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  await sell("msct", 1200);
  await sell("star-xi", 900);
  await sell("iconic", 500);
  const ws = new WebSocket(BASE.replace("http", "ws") + "/api/auction/live", { headers: { Origin: BASE } });
  const msgs = [];
  ws.addEventListener("message", (e) => e.data !== "pong" && msgs.push(JSON.parse(e.data)));
  await new Promise((r) => ws.addEventListener("open", r));
  await sleep(300);
  const before2 = await capture();
  const r2 = await doReset("2 after several sales", before2);
  await sleep(500);
  const resetMsg = msgs.find((m) => m.type === "reset");
  assert.ok(resetMsg, "AUCTION_RESET broadcast received");
  assert.equal(resetMsg.snapshot.counts.sold, 0);
  assert.equal(resetMsg.snapshot.resetEpoch, before2.state.resetEpoch + 1);
  ws.close();
  const ws2 = new WebSocket(BASE.replace("http", "ws") + "/api/auction/live", { headers: { Origin: BASE } });
  const first = await new Promise((r) => ws2.addEventListener("message", (e) => r(JSON.parse(e.data))));
  assert.equal(first.snapshot.counts.sold, 0);
  assert.equal(first.snapshot.status, "NOT_STARTED");
  ws2.close();
  ok("20 connected screen got an AUCTION_RESET message with the fresh state; a reconnecting screen loads the fresh state");

  // ---- 16. duplicate + cooldown -------------------------------------------------------------------------
  const vDup = (await state()).version;
  const dup = await SUPER.reset({ requestId: r2.requestId });
  assert.equal(dup.status, 200);
  assert.equal(dup.data.duplicate, true);
  assert.equal(dup.data.reset.requestId, r2.requestId);
  assert.equal((await state()).version, vDup);
  ok("16 replaying a completed reset request → recognised as duplicate, nothing reset again");
  const cool = await SUPER.reset();
  assert.equal(cool.status, 429);
  assert.equal(cool.data.code, "RESET_COOLDOWN");
  lastResetAt = Date.now();
  ok("a second reset within the cooldown → 429 RESET_COOLDOWN");

  // ---- 3. price correction ----------------------------------------------------------------------------
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  const a = await sell("msct", 1200);
  let ls = await liveSale(a.player.id);
  assert.equal((await SUPER.cmd({ type: "correct", saleId: ls.saleId, teamId: "msct", price: 1000, reason: "Price was 1000", idempotencyKey: key() })).status, 200);
  await doReset("3 after a price correction", await capture());

  // ---- 4. team correction -------------------------------------------------------------------------------
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  const b = await sell("rkct", 800);
  ls = await liveSale(b.player.id);
  assert.equal((await SUPER.cmd({ type: "correct", saleId: ls.saleId, teamId: "myct", price: 800, reason: "Wrong team recorded", idempotencyKey: key() })).status, 200);
  await doReset("4 after a team correction", await capture());

  // ---- 5. undo + reopen -----------------------------------------------------------------------------------
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  const c = await sell("iconic", 600);
  ls = await liveSale(c.player.id);
  assert.equal((await SUPER.cmd({ type: "undo", saleId: ls.saleId, reason: "Sale cancelled", idempotencyKey: key() })).status, 200);
  assert.equal((await SUPER.cmd({ type: "reopen", playerId: c.player.id, reason: "Second round", idempotencyKey: key() })).status, 200);
  await doReset("5 after undo and reopen", await capture());

  // ---- 6. resold ---------------------------------------------------------------------------------------------
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  const d6 = await sell("royal-boyzz", 700);
  ls = await liveSale(d6.player.id);
  assert.equal((await SUPER.cmd({ type: "undo", saleId: ls.saleId, reason: "Undo for resale", idempotencyKey: key() })).status, 200);
  assert.equal((await SUPER.cmd({ type: "reopen", playerId: d6.player.id, reason: "Reopen for resale", idempotencyKey: key() })).status, 200);
  await SUPER.cmd({ type: "select", playerId: d6.player.id });
  assert.equal((await SUPER.cmd({ type: "sell", playerId: d6.player.id, teamId: "bajarangmonks", price: 950, idempotencyKey: key() })).status, 200);
  await doReset("6 after a player was resold", await capture());

  // ---- 7. paused ---------------------------------------------------------------------------------------------
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  await sell("limited-lions", 400);
  assert.equal((await SUPER.cmd({ type: "pause" })).status, 200);
  assert.equal((await state()).status, "PAUSED");
  await doReset("7 while the auction is PAUSED", await capture());

  // ---- 8. running, with a sale racing the reset (maintenance lock) ---------------------------------------------
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  await sell("star-xi", 300);
  const p8 = nextPlayer(await state());
  await SUPER.cmd({ type: "select", playerId: p8.id });
  const before8 = await capture();
  await sleep(Math.max(0, 5200 - (Date.now() - lastResetAt)));
  const [rr, rs] = await Promise.all([
    SUPER.reset(),
    (async () => {
      await sleep(5);
      return SUPER.http("/api/auction/admin/command", { method: "POST", body: { type: "sell", playerId: p8.id, teamId: "msct", price: 500, idempotencyKey: key() } });
    })(),
  ]);
  lastResetAt = Date.now();
  assert.equal(rr.status, 200, JSON.stringify(rr.data));
  const s8 = await state();
  assert.equal(s8.counts.sold, 0, "no sale survives the reset");
  console.log(`    (racing sale answered ${rs.status} ${rs.data?.code ?? "ok"})`);
  assert.ok(rs.data?.code === "MAINTENANCE" || rs.data?.code === "AUCTION_NOT_ACTIVE" || rs.data?.ok === true);
  if (rs.data?.ok !== true) {
    await verifyFresh("8 while RUNNING with a racing sale", before8, rr.data);
  } else {
    ok("8 while RUNNING: the racing sale committed before the reset and was erased by it");
  }
} else if (MODE === "main2") {
  // ---- 9. completed auction ---------------------------------------------------------------------------------
  let s = await state();
  if (!s.counts.pool) assert.equal((await SUPER.cmd({ type: "loadPool" })).status, 200);
  assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  for (let i = 0; i < 200; i++) {
    s = await state();
    const p = nextPlayer(s);
    const t = s.teams.filter((x) => x.slotsLeft > 0).sort((x, y) => x.purchased - y.purchased)[0];
    if (!p || !t) break;
    await SUPER.cmd({ type: "select", playerId: p.id });
    const price = Math.max(100, Math.min(t.maxNextPrice, Math.floor(t.remaining / t.slotsLeft / 50) * 50));
    assert.equal((await SUPER.cmd({ type: "sell", playerId: p.id, teamId: t.id, price, idempotencyKey: key() })).status, 200);
  }
  assert.equal((await SUPER.cmd({ type: "complete" })).status, 200);
  assert.equal((await state()).status, "COMPLETED");
  lastResetAt = Date.now() - 6000;
  await doReset("9 after the auction was COMPLETED (88 sold)", await capture());

  // ---- 19. two resets at once -----------------------------------------------------------------------------------
  await sleep(5200);
  const before19 = await capture();
  const [x, y] = await Promise.all([SUPER.reset(), SUPER.reset()]);
  lastResetAt = Date.now();
  const okOnes = [x, y].filter((r) => r.data.ok);
  const refused = [x, y].filter((r) => !r.data.ok);
  assert.equal(okOnes.length, 1, JSON.stringify([x.data.code, y.data.code]));
  assert.ok(["RESET_IN_PROGRESS", "RESET_COOLDOWN"].includes(refused[0].data.code), refused[0].data.code);
  assert.equal((await state()).resetEpoch, before19.state.resetEpoch + 1, "exactly one reset happened");
  ok(`19 two simultaneous resets → one completed, the other refused (${refused[0].data.code})`);

  // ---- accounts and Google Sheets still work after resets --------------------------------------------------------
  const again = new Session(SUPER.name, SUPER.password);
  await again.login();
  const reload = await again.cmd({ type: "loadPool" });
  assert.equal(reload.status, 200, JSON.stringify(reload.data));
  assert.equal((await state()).counts.pool, 88);
  ok("admin can sign in again after resets; pool reloads from Google Sheets (88 players)");
} else if (MODE === "burst") {
  // ---- 19 (burst). many simultaneous resets: exactly one runs --------------------------------------------------------
  await sleep(5200);
  const before = await capture();
  const results = await Promise.all(Array.from({ length: 6 }, () => SUPER.reset()));
  const codes = results.map((r) => (r.data.ok ? "OK" : r.data.code));
  assert.equal(codes.filter((c) => c === "OK").length, 1, codes.join(","));
  assert.ok(codes.every((c) => ["OK", "RESET_IN_PROGRESS", "RESET_COOLDOWN"].includes(c)), codes.join(","));
  assert.equal((await state()).resetEpoch, before.state.resetEpoch + 1, "exactly one reset happened");
  ok(`19 six simultaneous resets → exactly one ran; others refused [${codes.join(", ")}]`);
} else if (MODE === "fault-backup" || MODE === "fault-database") {
  // ---- 17 / 18. failures leave the auction untouched ----------------------------------------------------------------
  let s = await state();
  if (!s.counts.pool) assert.equal((await SUPER.cmd({ type: "loadPool" })).status, 200);
  if (s.status === "NOT_STARTED") assert.equal((await SUPER.cmd({ type: "start" })).status, 200);
  await sell("msct", 700);
  await sell("rkct", 450);
  const soldPlayer = (await state()).players.find((p) => p.status === "SOLD");
  const sale = await liveSale(soldPlayer.id);
  assert.equal((await SUPER.cmd({ type: "correct", saleId: sale.saleId, teamId: sale.teamId, price: sale.price + 50, reason: "Before fault test", idempotencyKey: key() })).status, 200);
  const before = await capture();
  await sleep(5200);
  const requestId = key();
  const r = await SUPER.reset({ requestId });
  const expected = MODE === "fault-backup" ? "BACKUP_FAILED" : "RESET_FAILED";
  assert.equal(r.status, 500, JSON.stringify(r.data));
  assert.equal(r.data.code, expected);
  const after = await capture();
  assert.equal(after.state.version, before.state.version, "version unchanged");
  assert.equal(after.state.resetEpoch, before.state.resetEpoch);
  assert.equal(after.state.counts.sold, before.state.counts.sold);
  assert.deepEqual(after.detail.sales, before.detail.sales);
  assert.deepEqual(after.detail.corrections, before.detail.corrections);
  assert.deepEqual(after.detail.events, before.detail.events);
  assert.deepEqual(after.state.teams, before.state.teams);
  ok(`${MODE === "fault-backup" ? "17 backup failure" : "18 database failure mid-transaction"} → ${expected}; auction, sales, corrections and history unchanged`);
  if (MODE === "fault-database") {
    assert.ok(r.data.backup?.id, "backup reported");
    const dl = await SUPER.http(`/api/auction/admin/reset-backups/${r.data.backup.id}`);
    assert.equal(dl.status, 200);
    assert.equal(JSON.parse(typeof dl.data === "string" ? dl.data : JSON.stringify(dl.data)).tables.auction_sales.length, before.detail.sales.length);
    ok("18 the verified backup taken before the failed transaction is kept and downloadable");
  }
  await sleep(5200);
  const replay = await SUPER.reset({ requestId });
  assert.equal(replay.data.code, "DUPLICATE_REQUEST");
  ok("16 replaying a failed reset request → DUPLICATE_REQUEST (a new request is needed)");
} else {
  throw new Error(`unknown RESET_MODE ${MODE}`);
}

console.log(`\n${passed} checks passed.`);
