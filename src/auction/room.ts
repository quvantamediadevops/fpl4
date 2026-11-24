/*
 * AuctionRoom Durable Object: the single writer for the auction.
 *
 * - Every command runs through one in-memory queue, so two admin requests can
 *   never interleave (a Durable Object alone does not guarantee that while it
 *   awaits D1).
 * - Each command is validated with rules.ts for a clear message, then written
 *   as one D1 batch (a transaction). The batch starts with a guard statement
 *   that re-checks the same rules inside the transaction and aborts it if they
 *   no longer hold, so the database never accepts an invalid state.
 * - After a successful write the snapshot is rebuilt from D1 and pushed to every
 *   connected screen over WebSockets (hibernation API: idle sockets cost nothing).
 */
import { teams as configTeams } from "../config/tournament";
import type { PlayerRole } from "../types/player";
import type { AuctionEnv, D1Database, D1PreparedStatement, DurableObjectState } from "./cf";
import {
  checkCompletion,
  checkCorrection,
  checkSale,
  correctionAction,
  correctionLedger,
  checkStart,
  describeRejection,
  describeTransition,
  teamPosition,
  transitionTarget,
  type AuctionPlayerStatus,
  type AuctionRules,
  type AuctionStatus,
  type CompletionInput,
  validReason,
} from "./rules";
import {
  BACKUP_ID,
  REQUEST_ID,
  RESET_BACKUPS_KEPT,
  RESET_COOLDOWN_MS,
  RESET_MAX_PER_HOUR,
  phraseMatches,
  superAdminNames,
  type ResetBackupInfo,
  type ResetEnvironment,
  type ResetInfo,
  type ResetOutcome,
} from "./reset";
import type { AuctionAdminDetail, AuctionCommand, AuctionEventView, AuctionSnapshot, AuctionTeamView, CommandResult, CorrectionKind, ResetRequest } from "./types";

declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };

const MAX_SOCKETS = 400;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 40; // commands per admin per window (a person needs far fewer)
const PRESENTER_EVENTS = [
  "PLAYER_SELECTED",
  "PLAYER_SOLD",
  "PLAYER_UNSOLD",
  "SALE_REVERSED",
  "SALE_CORRECTED",
  "PLAYER_REOPENED",
  "AUCTION_STARTED",
  "AUCTION_PAUSED",
  "AUCTION_RESUMED",
  "AUCTION_COMPLETED",
];
const KEY = /^[A-Za-z0-9-]{16,64}$/;

const now = () => new Date().toISOString();
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const MAINTENANCE = { ok: false, code: "MAINTENANCE", message: "The auction is being reset. Wait a moment, then reload." } as const;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** First statement of every write batch: aborts the transaction unless `condition` holds. */
function guard(db: D1Database, condition: string, ...params: unknown[]): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO auction_settings (id, team_budget, players_per_team, minimum_bid, maximum_bid, created_at, updated_at)
       SELECT 1, 1, 1, 1, 1, '', '' WHERE NOT COALESCE((${condition}), 0)`,
    )
    .bind(...params);
}

const S = (col: string) => `(SELECT ${col} FROM auction_settings WHERE id = 1)`;
const LIVE_COUNT = (team: string) => `(SELECT COUNT(*) FROM auction_sales WHERE team_id = ${team} AND reversed_at IS NULL)`;
const LIVE_SPENT = (team: string) => `(SELECT COALESCE(SUM(sold_price), 0) FROM auction_sales WHERE team_id = ${team} AND reversed_at IS NULL)`;

export class AuctionRoom {
  private snapshot: AuctionSnapshot | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private rate = new Map<string, number[]>();
  /** Set from the moment a reset is accepted until it has finished: every other command is refused, not queued. */
  private resetting = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: AuctionEnv,
  ) {}

  private get db() {
    return this.env.AUCTION_DB;
  }

  /** Runs `fn` after every earlier command has finished. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case "/live":
          return this.acceptSocket(request);
        case "/state":
          return Response.json(await this.serial(() => this.getSnapshot()));
        case "/admin-detail":
          return Response.json(await this.adminDetail());
        case "/command": {
          if (request.method !== "POST") return new Response(null, { status: 405 });
          const { adminId, command } = (await request.json()) as { adminId: string; command: AuctionCommand };
          if (this.resetting) return Response.json(MAINTENANCE, { status: 409 });
          const result = await this.serial(() => this.execute(adminId, command));
          return Response.json(result, { status: result.ok ? 200 : 409 });
        }
        case "/reset": {
          if (request.method !== "POST") return new Response(null, { status: 405 });
          const { adminId, reset } = (await request.json()) as { adminId: string; reset: ResetRequest };
          // Checked and set synchronously after the body is read: a second reset arriving while one runs is refused.
          if (this.resetting) return Response.json({ ok: false, code: "RESET_IN_PROGRESS", message: "A reset is already running. Wait for it to finish." }, { status: 409 });
          this.resetting = true;
          try {
            const result = await this.serial(() => this.reset(adminId, reset));
            return Response.json(result, { status: result.ok ? 200 : 409 });
          } finally {
            this.resetting = false;
          }
        }
        case "/reset-info":
          return Response.json(await this.resetInfo(url.searchParams.get("environment") === "LOCAL" ? "LOCAL" : "PRODUCTION"));
        case "/reset-backup": {
          const id = url.searchParams.get("id") ?? "";
          const text = BACKUP_ID.test(id) ? this.readBackup(id) : null;
          return text === null ? new Response(null, { status: 404 }) : new Response(text, { headers: { "Content-Type": "application/json; charset=utf-8" } });
        }
        default:
          return new Response(null, { status: 404 });
      }
    } catch (error) {
      console.error("[auction] room error", error instanceof Error ? error.message : error);
      return Response.json({ ok: false, code: "INTERNAL", message: "The auction server could not complete the request." }, { status: 500 });
    }
  }

  // ---- WebSockets ---------------------------------------------------------

  private async acceptSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    if (this.state.getWebSockets().length >= MAX_SOCKETS) return new Response("Too many connections", { status: 503 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    const snapshot = await this.serial(() => this.getSnapshot());
    server.send(JSON.stringify({ type: "state", snapshot }));
    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  // Screens are read-only: the only message accepted is a heartbeat.
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, "closing");
    } catch {
      /* already closed */
    }
  }

  async webSocketError() {}

  private broadcast(snapshot: AuctionSnapshot, type: "state" | "reset" = "state") {
    const message = JSON.stringify({ type, snapshot });
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        /* a dead socket is cleaned up by the runtime */
      }
    }
  }

  // ---- Snapshot -----------------------------------------------------------

  private photo(key: string | null): string | null {
    return key && this.env.PLAYER_PHOTOS === "on" ? `/api/photos/${key}` : null;
  }

  private async getSnapshot(): Promise<AuctionSnapshot> {
    if (!this.snapshot) this.snapshot = await this.buildSnapshot();
    return this.snapshot;
  }

  private async buildSnapshot(): Promise<AuctionSnapshot> {
    const [settingsR, teamsR, iconsR, playersR, ledgerR, recentR, eventR, resetR] = await this.db.batch([
      this.db.prepare("SELECT * FROM auction_settings WHERE id = 1"),
      this.db.prepare("SELECT id, team_name, initial_budget, sort_order FROM auction_teams ORDER BY sort_order"),
      this.db.prepare("SELECT team_id, icon_name FROM auction_icons"),
      this.db.prepare("SELECT * FROM auction_players ORDER BY sheet_order"),
      this.db.prepare("SELECT team_id, COUNT(*) AS n, SUM(sold_price) AS spent FROM auction_sales WHERE reversed_at IS NULL GROUP BY team_id"),
      this.db.prepare("SELECT id, player_id, team_id, sold_price, confirmed_at FROM auction_sales WHERE reversed_at IS NULL ORDER BY confirmed_at DESC, rowid DESC LIMIT 10"),
      this.db
        .prepare(`SELECT event_id, event_type, player_id, team_id, amount, timestamp FROM auction_events WHERE event_type IN (${PRESENTER_EVENTS.map(() => "?").join(",")}) ORDER BY event_id DESC LIMIT 1`)
        .bind(...PRESENTER_EVENTS),
      this.db.prepare("SELECT COUNT(*) AS n FROM auction_admin_audit WHERE action = 'AUCTION_RESET' AND phase = 'COMPLETED'"),
    ]);

    const s = settingsR?.results[0];
    if (!s) throw new Error("auction_settings row missing; apply migrations");
    const rules: AuctionRules = {
      teamBudget: num(s.team_budget),
      playersPerTeam: num(s.players_per_team),
      minimumBid: num(s.minimum_bid),
      maximumBid: num(s.maximum_bid),
    };

    const players = (playersR?.results ?? []).map((p) => ({
      id: String(p.player_id),
      key: String(p.photo_key),
      name: String(p.name),
      role: (str(p.role) as PlayerRole | null) ?? null,
      photo: this.photo(str(p.photo_key)),
      status: String(p.status) as AuctionPlayerStatus,
      teamId: str(p.winning_team_id),
      price: p.sold_price == null ? null : num(p.sold_price),
      soldAt: str(p.sold_at),
      unsoldCount: num(p.unsold_count),
      order: num(p.sheet_order),
    }));

    const ledger = new Map((ledgerR?.results ?? []).map((r) => [String(r.team_id), { purchased: num(r.n), spent: num(r.spent) }]));
    const icons = new Map((iconsR?.results ?? []).map((r) => [String(r.team_id), { name: String(r.icon_name) }]));

    // Before the pool is loaded the team table is empty: show the official teams with untouched budgets.
    const dbTeams = teamsR?.results ?? [];
    const teamRows = dbTeams.length
      ? dbTeams.map((t) => ({ id: String(t.id), name: String(t.team_name), initialBudget: num(t.initial_budget) }))
      : configTeams.map((t) => ({ id: t.slug, name: t.name, initialBudget: rules.teamBudget }));

    const teams: AuctionTeamView[] = teamRows.map((t) => {
      const cfg = configTeams.find((c) => c.slug === t.id);
      const l = ledger.get(t.id) ?? { purchased: 0, spent: 0 };
      const pos = teamPosition(rules, { initialBudget: t.initialBudget, ...l });
      const icon = icons.get(t.id) ?? (cfg && !dbTeams.length ? { name: cfg.icon } : null);
      return {
        id: t.id,
        name: t.name,
        logo: cfg?.logo ?? "",
        owner: cfg?.owner ?? "",
        initialBudget: t.initialBudget,
        spent: pos.spent,
        remaining: pos.remaining,
        purchased: pos.purchased,
        slotsLeft: pos.slotsLeft,
        reserve: pos.reserve,
        maxNextPrice: pos.maxNextPrice,
        icon: icon ? { name: icon.name } : null,
        players: players
          .filter((p) => p.status === "SOLD" && p.teamId === t.id)
          .sort((a, b) => (a.soldAt ?? "").localeCompare(b.soldAt ?? ""))
          .map((p) => ({ playerId: p.id, name: p.name, role: p.role, price: p.price ?? 0, photo: p.photo })),
      };
    });

    const e = eventR?.results[0];
    const lastEvent: AuctionEventView | null = e
      ? { id: num(e.event_id), type: String(e.event_type) as AuctionEventView["type"], playerId: str(e.player_id), teamId: str(e.team_id), amount: e.amount == null ? null : num(e.amount), at: String(e.timestamp) }
      : null;

    const sold = players.filter((p) => p.status === "SOLD").length;
    const unsold = players.filter((p) => p.status === "UNSOLD").length;
    const spent = teams.reduce((a, t) => a + t.spent, 0);
    const budget = teams.reduce((a, t) => a + t.initialBudget, 0);

    return {
      version: num(s.version),
      status: String(s.status) as AuctionStatus,
      rules,
      teams,
      players: players.map(({ id, name, role, photo, status, teamId, price, unsoldCount, order }) => ({ id, name, role, photo, status, teamId, price, unsoldCount, order })),
      currentPlayerId: str(s.current_player_id),
      recent: (recentR?.results ?? []).map((r) => ({ saleId: String(r.id), playerId: String(r.player_id), teamId: String(r.team_id), price: num(r.sold_price), at: String(r.confirmed_at) })),
      lastEvent,
      counts: {
        pool: players.length,
        sold,
        available: players.length - sold - unsold,
        unsold,
        spent,
        combinedRemaining: budget - spent,
        filledSlots: sold,
        totalSlots: teams.length * rules.playersPerTeam,
      },
      updatedAt: String(s.updated_at),
      resetEpoch: num(resetR?.results[0]?.n),
    };
  }

  private async adminDetail(): Promise<AuctionAdminDetail> {
    const [eventsR, salesR, correctionsR] = await this.db.batch([
      this.db.prepare("SELECT * FROM auction_events ORDER BY event_id DESC LIMIT 120"),
      this.db.prepare("SELECT * FROM auction_sales ORDER BY confirmed_at DESC, rowid DESC"),
      this.db.prepare("SELECT * FROM auction_corrections ORDER BY created_at DESC, rowid DESC"),
    ]);
    return {
      events: (eventsR?.results ?? []).map((e) => ({
        id: num(e.event_id),
        type: String(e.event_type) as AuctionEventView["type"],
        playerId: str(e.player_id),
        teamId: str(e.team_id),
        amount: e.amount == null ? null : num(e.amount),
        at: String(e.timestamp),
        adminId: String(e.admin_id),
        metadata: e.metadata ? (JSON.parse(String(e.metadata)) as Record<string, unknown>) : null,
      })),
      sales: (salesR?.results ?? []).map((r) => ({
        saleId: String(r.id),
        playerId: String(r.player_id),
        teamId: String(r.team_id),
        price: num(r.sold_price),
        at: String(r.confirmed_at),
        adminId: String(r.admin_id),
        reversedAt: str(r.reversed_at),
        reversedBy: str(r.reversed_by),
        reversalReason: str(r.reversal_reason),
      })),
      corrections: (correctionsR?.results ?? []).map((c) => ({
        id: String(c.id),
        action: String(c.action) as CorrectionKind,
        playerId: String(c.player_id),
        originalSaleId: str(c.original_sale_id),
        replacementSaleId: str(c.replacement_sale_id),
        fromTeamId: str(c.from_team_id),
        toTeamId: str(c.to_team_id),
        fromPrice: c.from_price == null ? null : num(c.from_price),
        toPrice: c.to_price == null ? null : num(c.to_price),
        reason: String(c.reason),
        adminId: String(c.admin_id),
        at: String(c.created_at),
      })),
    };
  }

  /** A correction with this key already ran: same request → report its outcome; different request → refuse. */
  private async priorCorrection(key: string, expect: { action: CorrectionKind[]; playerId?: string; saleId?: string; teamId?: string; price?: number }) {
    const prior = await this.db.prepare("SELECT * FROM auction_corrections WHERE idempotency_key = ?1").bind(key).first();
    if (!prior) return null;
    const same =
      expect.action.includes(String(prior.action) as CorrectionKind) &&
      (expect.playerId === undefined || prior.player_id === expect.playerId) &&
      (expect.saleId === undefined || prior.original_sale_id === expect.saleId) &&
      (expect.teamId === undefined || prior.to_team_id === expect.teamId) &&
      (expect.price === undefined || num(prior.to_price) === expect.price);
    if (!same) throw new CommandError("IDEMPOTENCY_CONFLICT", "This confirmation was already used for a different correction. Reload and try again.");
    return { saleId: str(prior.replacement_sale_id) ?? str(prior.original_sale_id) ?? undefined, duplicate: true };
  }

  private correctionRow(fields: {
    action: CorrectionKind;
    playerId: string;
    originalSaleId?: string | null;
    replacementSaleId?: string | null;
    fromTeamId?: string | null;
    toTeamId?: string | null;
    fromPrice?: number | null;
    toPrice?: number | null;
    reason: string;
    adminId: string;
    at: string;
    key: string;
  }) {
    return this.db
      .prepare(
        `INSERT INTO auction_corrections (id, action, player_id, original_sale_id, replacement_sale_id, from_team_id, to_team_id, from_price, to_price, reason, admin_id, created_at, idempotency_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      )
      .bind(
        crypto.randomUUID(),
        fields.action,
        fields.playerId,
        fields.originalSaleId ?? null,
        fields.replacementSaleId ?? null,
        fields.fromTeamId ?? null,
        fields.toTeamId ?? null,
        fields.fromPrice ?? null,
        fields.toPrice ?? null,
        fields.reason,
        fields.adminId,
        fields.at,
        fields.key,
      );
  }

  // ---- Commands -----------------------------------------------------------

  private limited(adminId: string): boolean {
    const t = Date.now();
    const hits = (this.rate.get(adminId) ?? []).filter((x) => t - x < RATE_WINDOW_MS);
    hits.push(t);
    this.rate.set(adminId, hits);
    return hits.length > RATE_LIMIT;
  }

  private async execute(adminId: string, command: AuctionCommand): Promise<CommandResult> {
    if (this.limited(adminId)) return { ok: false, code: "RATE_LIMITED", message: "Too many actions in a short time. Wait a few seconds." };
    try {
      const before = await this.getSnapshot();
      const extra = await this.apply(adminId, command, before);
      this.snapshot = await this.buildSnapshot();
      this.broadcast(this.snapshot);
      return { ok: true, snapshot: this.snapshot, ...extra };
    } catch (error) {
      // Anything unexpected (including a guard abort) may mean our view was stale: reload from D1.
      this.snapshot = await this.buildSnapshot().catch(() => null);
      if (error instanceof CommandError) return { ok: false, code: error.code, message: error.message, snapshot: this.snapshot ?? undefined };
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE|PRIMARY KEY|constraint/i.test(message)) {
        return { ok: false, code: "STATE_CHANGED", message: "The auction changed while this action was running. Nothing was saved; check the screen and try again.", snapshot: this.snapshot ?? undefined };
      }
      throw error;
    }
  }

  // ---- HARD RESET ----------------------------------------------------------
  //
  // Order (all inside the command queue, with every other command refused meanwhile):
  //   1. validate (super-admin, exact phrase, acknowledgement, request id, cooldown, hourly cap)
  //   2. audit STARTED
  //   3. verified backup of every auction table into this object's private SQLite storage
  //      (read back and checked by SHA-256 and row counts); any failure aborts before anything is deleted
  //   4. ONE D1 batch (a single transaction): guard row, delete corrections -> sales -> events
  //      (foreign-key order), players back to AVAILABLE, settings back to NOT_STARTED,
  //      guard row removed, audit COMPLETED. Either all of it commits or none of it does.
  //   5. rebuild the snapshot from D1 and broadcast AUCTION_RESET to every screen
  // Teams, icons, the player pool, rules, sessions, login throttling and migrations are not touched.
  // The version keeps increasing (screens ignore older versions), and event ids continue.

  private isSuperAdmin(adminId: string) {
    return superAdminNames(this.env.AUCTION_SUPER_ADMINS).has(adminId.toLowerCase());
  }

  private async databaseRef(): Promise<string> {
    const row = await this.db.prepare("SELECT created_at FROM auction_settings WHERE id = 1").first<{ created_at: string }>();
    return `AUCTION_DB#${(await sha256Hex(`fpl-auction|${row?.created_at ?? ""}`)).slice(0, 12)}`;
  }

  private audit(phase: "STARTED" | "COMPLETED" | "FAILED", f: { requestId: string; adminId: string; environment: ResetEnvironment; database: string; at: string; backup?: ResetBackupInfo | null; detail?: unknown }) {
    return this.db
      .prepare(
        `INSERT INTO auction_admin_audit (request_id, action, phase, admin_id, environment, database_ref, backup_ref, backup_sha256, backup_bytes, detail, created_at)
         VALUES (?1, 'AUCTION_RESET', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(f.requestId, phase, f.adminId, f.environment, f.database, f.backup?.id ?? null, f.backup?.sha256 ?? null, f.backup?.bytes ?? null, f.detail === undefined ? null : JSON.stringify(f.detail), f.at);
  }

  private async reset(adminId: string, req: ResetRequest): Promise<CommandResult> {
    const fail = (code: string, message: string, backup?: ResetBackupInfo): CommandResult => ({ ok: false, code, message, snapshot: this.snapshot ?? undefined, ...(backup ? { backup } : {}) });
    // Re-checked here (the API route checks too): never trust a single layer for a destructive action.
    if (!this.isSuperAdmin(adminId)) return fail("FORBIDDEN", "Only a super-admin can reset the auction.");
    if (req.acknowledged !== true) return fail("CONFIRMATION_REQUIRED", "Tick the confirmation box first.");
    if (!phraseMatches(req.phrase)) return fail("PHRASE_MISMATCH", "The confirmation phrase does not match exactly.");
    if (typeof req.requestId !== "string" || !REQUEST_ID.test(req.requestId)) return fail("BAD_REQUEST", "Invalid reset request.");
    const environment: ResetEnvironment = req.environment === "LOCAL" ? "LOCAL" : "PRODUCTION";
    if (this.limited(adminId)) return fail("RATE_LIMITED", "Too many actions in a short time. Wait a few seconds.");

    // Idempotency: the same request id never resets twice.
    const prior = await this.db.prepare("SELECT phase, detail FROM auction_admin_audit WHERE request_id = ?1 ORDER BY id DESC").bind(req.requestId).all<{ phase: string; detail: string | null }>();
    const done = prior.results.find((r) => r.phase === "COMPLETED");
    if (done) {
      this.snapshot = await this.buildSnapshot();
      return { ok: true, snapshot: this.snapshot, duplicate: true, reset: JSON.parse(done.detail ?? "null") as ResetOutcome };
    }
    if (prior.results.length) return fail("DUPLICATE_REQUEST", "This reset request was already used. Start a new reset.");

    const now = Date.now();
    const recent = await this.db
      .prepare("SELECT MAX(created_at) AS last, COUNT(*) AS n FROM auction_admin_audit WHERE action = 'AUCTION_RESET' AND phase = 'STARTED' AND created_at > ?1")
      .bind(new Date(now - 3_600_000).toISOString())
      .first<{ last: string | null; n: number }>();
    if (recent?.last && now - Date.parse(recent.last) < RESET_COOLDOWN_MS) return fail("RESET_COOLDOWN", "A reset was just attempted. Wait a few seconds before trying again.");
    if (num(recent?.n) >= RESET_MAX_PER_HOUR) return fail("RATE_LIMITED", "Too many reset attempts in the last hour.");

    const database = await this.databaseRef();
    const startedAt = new Date().toISOString();
    const base = { requestId: req.requestId, adminId, environment, database };
    await this.audit("STARTED", { ...base, at: startedAt }).run();
    console.log(`[auction] RESET STARTED request=${req.requestId} admin=${adminId} env=${environment} db=${database}`);
    const fault = environment === "LOCAL" ? this.env.AUCTION_RESET_FAULT : undefined;

    let backup: ResetBackupInfo;
    try {
      backup = await this.createVerifiedBackup({ requestId: req.requestId, adminId, environment, database, at: startedAt, fault });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit("FAILED", { ...base, at: new Date().toISOString(), detail: { stage: "backup", error: message } }).run().catch(() => {});
      console.error(`[auction] RESET ABORTED (backup) request=${req.requestId}: ${message}`);
      return fail("BACKUP_FAILED", "The backup could not be created and verified, so nothing was reset. The auction is unchanged.");
    }

    const completedAt = new Date().toISOString();
    const outcome: ResetOutcome = { requestId: req.requestId, completedAt, backup };
    const db = this.db;
    const statements = [
      db.prepare("INSERT INTO auction_reset_guard (id, request_id) VALUES (1, ?1)").bind(req.requestId),
      db.prepare("DELETE FROM auction_corrections"),
      db.prepare("DELETE FROM auction_sales"),
      db.prepare("DELETE FROM auction_events"),
      db.prepare("UPDATE auction_players SET status = 'AVAILABLE', winning_team_id = NULL, sold_price = NULL, sold_at = NULL, unsold_count = 0"),
      db.prepare("UPDATE auction_settings SET status = 'NOT_STARTED', current_player_id = NULL, version = version + 1, updated_at = ?1 WHERE id = 1").bind(completedAt),
      // Local test only: a statement that fails after the deletes, to prove the whole batch rolls back.
      ...(fault === "database" ? [db.prepare("INSERT INTO auction_reset_guard (id, request_id) VALUES (1, ?1)").bind(req.requestId)] : []),
      db.prepare("DELETE FROM auction_reset_guard"),
      this.audit("COMPLETED", { ...base, at: completedAt, backup, detail: outcome }),
    ];
    try {
      await db.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.audit("FAILED", { ...base, at: new Date().toISOString(), backup, detail: { stage: "database", error: message } }).run().catch(() => {});
      this.snapshot = await this.buildSnapshot().catch(() => null);
      console.error(`[auction] RESET FAILED (database, rolled back) request=${req.requestId}: ${message}`);
      return fail("RESET_FAILED", `The database rejected the reset, so nothing was changed (the transaction was rolled back). Backup ${backup.id} is kept.`, backup);
    }

    this.snapshot = await this.buildSnapshot();
    this.broadcast(this.snapshot, "reset");
    console.log(`[auction] RESET COMPLETED request=${req.requestId} admin=${adminId} env=${environment} db=${database} backup=${backup.id}`);
    return { ok: true, snapshot: this.snapshot, reset: outcome };
  }

  // ---- Backups (private Durable Object storage; never served publicly) -------

  private backupTables() {
    const sql = this.state.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS reset_backups (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, request_id TEXT NOT NULL, admin_id TEXT NOT NULL,
      environment TEXT NOT NULL, database_ref TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
      rows TEXT NOT NULL, chunks INTEGER NOT NULL)`);
    sql.exec("CREATE TABLE IF NOT EXISTS reset_backup_chunks (backup_id TEXT NOT NULL, n INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (backup_id, n))");
    return sql;
  }

  private async createVerifiedBackup(f: { requestId: string; adminId: string; environment: ResetEnvironment; database: string; at: string; fault?: string }): Promise<ResetBackupInfo> {
    const tables = ["auction_settings", "auction_teams", "auction_icons", "auction_players", "auction_sales", "auction_events", "auction_corrections"] as const;
    // One batch = one consistent read; nothing else can write meanwhile (we hold the command queue).
    const results = await this.db.batch([
      ...tables.map((t) => this.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`)),
      this.db.prepare("SELECT name, applied_at FROM d1_migrations ORDER BY id"),
    ]);
    const data: Record<string, unknown[]> = {};
    const rows: Record<string, number> = {};
    tables.forEach((t, i) => {
      data[t] = results[i]?.results ?? [];
      rows[t] = data[t].length;
    });
    const json = JSON.stringify({
      format: "fpl-auction-backup/1",
      createdAt: f.at,
      requestId: f.requestId,
      adminId: f.adminId,
      environment: f.environment,
      database: f.database,
      migrations: results[tables.length]?.results ?? [],
      tables: data,
    });
    const sha256 = await sha256Hex(json);
    const bytes = new TextEncoder().encode(json).length;
    const id = `bk-${f.at.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${sha256.slice(0, 8)}`;
    const CHUNK = 400_000; // characters; well under the 2 MB row limit
    const parts: string[] = [];
    for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));

    const sql = this.backupTables();
    this.state.storage.transactionSync(() => {
      sql.exec(
        "INSERT INTO reset_backups (id, created_at, request_id, admin_id, environment, database_ref, bytes, sha256, rows, chunks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id, f.at, f.requestId, f.adminId, f.environment, f.database, bytes, sha256, JSON.stringify(rows), parts.length,
      );
      parts.forEach((p, n) => sql.exec("INSERT INTO reset_backup_chunks (backup_id, n, data) VALUES (?, ?, ?)", id, n, p));
    });

    // Verify by reading it back: same hash, parses, same row counts.
    const restored = this.readBackup(id);
    if (f.fault === "backup") throw new Error("injected backup fault (local test)");
    if (restored === null || (await sha256Hex(restored)) !== sha256) throw new Error("backup verification failed: checksum mismatch");
    const parsed = JSON.parse(restored) as { tables: Record<string, unknown[]> };
    for (const t of tables) if ((parsed.tables[t]?.length ?? -1) !== rows[t]) throw new Error(`backup verification failed: ${t} row count`);

    // Keep the newest backups only.
    sql.exec(`DELETE FROM reset_backup_chunks WHERE backup_id IN (SELECT id FROM reset_backups ORDER BY created_at DESC LIMIT -1 OFFSET ${RESET_BACKUPS_KEPT})`);
    sql.exec(`DELETE FROM reset_backups WHERE id IN (SELECT id FROM reset_backups ORDER BY created_at DESC LIMIT -1 OFFSET ${RESET_BACKUPS_KEPT})`);

    return { id, createdAt: f.at, bytes, sha256, rows, environment: f.environment, database: f.database, restorePoint: f.at };
  }

  private readBackup(id: string): string | null {
    const sql = this.backupTables();
    const meta = sql.exec<{ chunks: number }>("SELECT chunks FROM reset_backups WHERE id = ?", id).toArray()[0];
    if (!meta) return null;
    const parts = sql.exec<{ data: string }>("SELECT data FROM reset_backup_chunks WHERE backup_id = ? ORDER BY n", id).toArray();
    return parts.length === Number(meta.chunks) ? parts.map((p) => p.data).join("") : null;
  }

  private async resetInfo(environment: ResetEnvironment): Promise<ResetInfo> {
    const last = await this.db
      .prepare("SELECT created_at, admin_id, request_id, backup_ref FROM auction_admin_audit WHERE action = 'AUCTION_RESET' AND phase = 'COMPLETED' ORDER BY id DESC LIMIT 1")
      .first<{ created_at: string; admin_id: string; request_id: string; backup_ref: string | null }>();
    const backups = this.backupTables()
      .exec<{ id: string; created_at: string; bytes: number; sha256: string }>("SELECT id, created_at, bytes, sha256 FROM reset_backups ORDER BY created_at DESC LIMIT 5")
      .toArray()
      .map((b) => ({ id: b.id, createdAt: b.created_at, bytes: num(b.bytes), sha256: b.sha256 }));
    return {
      environment,
      database: await this.databaseRef(),
      lastReset: last ? { at: last.created_at, adminId: last.admin_id, requestId: last.request_id, backupRef: last.backup_ref } : null,
      backups,
    };
  }

  private event(type: string, adminId: string, at: string, fields: { playerId?: string | null; teamId?: string | null; amount?: number | null; metadata?: Record<string, unknown> } = {}) {
    return this.db
      .prepare("INSERT INTO auction_events (event_type, player_id, team_id, amount, admin_id, timestamp, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(type, fields.playerId ?? null, fields.teamId ?? null, fields.amount ?? null, adminId, at, fields.metadata ? JSON.stringify(fields.metadata) : null);
  }

  private bump(at: string, currentPlayer?: { set: string | null }) {
    return currentPlayer
      ? this.db.prepare("UPDATE auction_settings SET version = version + 1, updated_at = ?1, current_player_id = ?2 WHERE id = 1").bind(at, currentPlayer.set)
      : this.db.prepare("UPDATE auction_settings SET version = version + 1, updated_at = ?1 WHERE id = 1").bind(at);
  }

  private completionInput(snap: AuctionSnapshot): CompletionInput {
    return {
      rules: snap.rules,
      teamCount: configTeams.length,
      iconCount: snap.teams.filter((t) => t.icon).length,
      poolSize: snap.counts.pool,
      soldCount: snap.counts.sold,
      teams: snap.teams.map((t) => ({ initialBudget: t.initialBudget, spent: t.spent, purchased: t.purchased })),
    };
  }

  private async apply(adminId: string, cmd: AuctionCommand, snap: AuctionSnapshot): Promise<{ saleId?: string; duplicate?: boolean }> {
    const db = this.db;
    const at = now();

    switch (cmd.type) {
      case "loadPool": {
        if (snap.status !== "NOT_STARTED") throw new CommandError("POOL_LOCKED", "The pool is locked once the auction has started.");
        const { teams, icons, players } = cmd.pool;
        if (new Set(players.map((p) => p.id)).size !== players.length) throw new CommandError("DUPLICATE_PLAYER", "The pool contains a duplicate player.");
        if (icons.length !== teams.length || new Set(icons.map((i) => i.teamId)).size !== icons.length || icons.some((i) => !teams.some((t) => t.id === i.teamId) || !i.name.trim())) {
          throw new CommandError("ICONS_INVALID", "Every team needs exactly one icon player.");
        }
        const statements = [
          guard(db, `${S("status")} = 'NOT_STARTED' AND NOT EXISTS (SELECT 1 FROM auction_sales)`),
          db.prepare("DELETE FROM auction_icons"),
          db.prepare("DELETE FROM auction_players"),
          db.prepare("DELETE FROM auction_teams"),
          ...teams.map((t) =>
            db.prepare("INSERT INTO auction_teams (id, team_name, initial_budget, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(t.id, t.name, snap.rules.teamBudget, t.order, at),
          ),
          ...icons.map((i) => db.prepare("INSERT INTO auction_icons (team_id, icon_name, created_at) VALUES (?1, ?2, ?3)").bind(i.teamId, i.name, at)),
          ...players.map((p) =>
            db.prepare("INSERT INTO auction_players (player_id, photo_key, name, role, sheet_order) VALUES (?1, ?2, ?3, ?4, ?5)").bind(p.id, p.key, p.name, p.role, p.order),
          ),
          this.event("POOL_LOADED", adminId, at, { metadata: { players: players.length, teams: teams.length, icons: icons.length } }),
          this.bump(at, { set: null }),
        ];
        await db.batch(statements);
        return {};
      }

      case "start":
      case "pause":
      case "resume":
      case "complete": {
        const target = transitionTarget(cmd.type, snap.status);
        const input = this.completionInput(snap);
        if (!target) throw new CommandError("INVALID_TRANSITION", describeTransition("INVALID_TRANSITION", input));
        const blocked = cmd.type === "start" ? checkStart(input) : cmd.type === "complete" ? checkCompletion(input) : null;
        if (blocked) throw new CommandError(blocked, describeTransition(blocked, input));

        const teamCount = `(SELECT COUNT(*) FROM auction_teams)`;
        const ppt = S("players_per_team");
        const conditions: Record<typeof cmd.type, string> = {
          start: `${S("status")} = 'NOT_STARTED' AND (SELECT COUNT(*) FROM auction_players) = ${teamCount} * ${ppt} AND (SELECT COUNT(*) FROM auction_icons) = ${teamCount} AND ${teamCount} = ${configTeams.length}`,
          pause: `${S("status")} = 'ACTIVE'`,
          resume: `${S("status")} = 'PAUSED'`,
          complete: `${S("status")} IN ('ACTIVE','PAUSED')
            AND NOT EXISTS (SELECT 1 FROM auction_players WHERE status <> 'SOLD')
            AND NOT EXISTS (SELECT 1 FROM auction_teams t WHERE ${LIVE_COUNT("t.id")} <> ${ppt} OR ${LIVE_SPENT("t.id")} > t.initial_budget)
            AND (SELECT COUNT(*) FROM auction_icons) = ${teamCount}`,
        };
        const eventType = { start: "AUCTION_STARTED", pause: "AUCTION_PAUSED", resume: "AUCTION_RESUMED", complete: "AUCTION_COMPLETED" }[cmd.type];
        await db.batch([
          guard(db, conditions[cmd.type]),
          db.prepare("UPDATE auction_settings SET status = ?1 WHERE id = 1").bind(target),
          this.event(eventType, adminId, at),
          cmd.type === "complete" ? this.bump(at, { set: null }) : this.bump(at),
        ]);
        return {};
      }

      case "select": {
        const player = snap.players.find((p) => p.id === cmd.playerId);
        if (snap.status !== "ACTIVE") throw new CommandError("AUCTION_NOT_ACTIVE", describeRejection("AUCTION_NOT_ACTIVE", snap.rules));
        if (!player) throw new CommandError("PLAYER_NOT_FOUND", describeRejection("PLAYER_NOT_FOUND", snap.rules));
        if (player.status === "SOLD") throw new CommandError("PLAYER_ALREADY_SOLD", describeRejection("PLAYER_ALREADY_SOLD", snap.rules));
        await db.batch([
          guard(db, `${S("status")} = 'ACTIVE' AND EXISTS (SELECT 1 FROM auction_players WHERE player_id = ?1 AND status IN ('AVAILABLE','UNSOLD'))`, cmd.playerId),
          this.event("PLAYER_SELECTED", adminId, at, { playerId: cmd.playerId }),
          this.bump(at, { set: cmd.playerId }),
        ]);
        return {};
      }

      case "sell": {
        const key = typeof cmd.idempotencyKey === "string" ? cmd.idempotencyKey.trim() : "";
        if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) throw new CommandError("BAD_REQUEST", "Missing request key. Reload the page and try again.");
        // Same request again (double-click, network retry): report the original outcome.
        const prior = await db.prepare("SELECT id, player_id, team_id, sold_price FROM auction_sales WHERE idempotency_key = ?1").bind(key).first();
        if (prior) {
          if (prior.player_id !== cmd.playerId || prior.team_id !== cmd.teamId || num(prior.sold_price) !== cmd.price) {
            throw new CommandError("IDEMPOTENCY_CONFLICT", "This confirmation was already used for a different sale.");
          }
          return { saleId: String(prior.id), duplicate: true };
        }

        const player = snap.players.find((p) => p.id === cmd.playerId) ?? null;
        const team = snap.teams.find((t) => t.id === cmd.teamId) ?? null;
        const ledger = team ? { initialBudget: team.initialBudget, spent: team.spent, purchased: team.purchased } : null;
        const rejection = checkSale({
          rules: snap.rules,
          status: snap.status,
          currentPlayerId: snap.currentPlayerId,
          player: player ? { id: player.id, status: player.status } : null,
          team: ledger,
          price: cmd.price,
        });
        if (rejection) throw new CommandError(rejection, describeRejection(rejection, snap.rules, ledger ? teamPosition(snap.rules, ledger) : undefined));

        const saleId = crypto.randomUUID();
        await db.batch([
          guard(
            db,
            `${S("status")} = 'ACTIVE'
             AND ${S("current_player_id")} = ?1
             AND EXISTS (SELECT 1 FROM auction_players WHERE player_id = ?1 AND status IN ('AVAILABLE','UNSOLD'))
             AND EXISTS (SELECT 1 FROM auction_teams WHERE id = ?2)
             AND ?3 = CAST(?3 AS INTEGER)
             AND ?3 >= ${S("minimum_bid")} AND ?3 <= ${S("maximum_bid")}
             AND ${LIVE_COUNT("?2")} < ${S("players_per_team")}
             AND ?3 <= (SELECT initial_budget FROM auction_teams WHERE id = ?2) - ${LIVE_SPENT("?2")}
                       - (${S("players_per_team")} - 1 - ${LIVE_COUNT("?2")}) * ${S("minimum_bid")}`,
            cmd.playerId,
            cmd.teamId,
            cmd.price,
          ),
          db
            .prepare("INSERT INTO auction_sales (id, player_id, team_id, sold_price, confirmed_at, admin_id, idempotency_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
            .bind(saleId, cmd.playerId, cmd.teamId, cmd.price, at, adminId, key),
          db
            .prepare("UPDATE auction_players SET status = 'SOLD', winning_team_id = ?2, sold_price = ?3, sold_at = ?4 WHERE player_id = ?1")
            .bind(cmd.playerId, cmd.teamId, cmd.price, at),
          this.event("PLAYER_SOLD", adminId, at, { playerId: cmd.playerId, teamId: cmd.teamId, amount: cmd.price, metadata: { saleId } }),
          this.bump(at),
        ]);
        return { saleId };
      }

      case "unsold": {
        const player = snap.players.find((p) => p.id === cmd.playerId);
        if (snap.status !== "ACTIVE") throw new CommandError("AUCTION_NOT_ACTIVE", describeRejection("AUCTION_NOT_ACTIVE", snap.rules));
        if (!player) throw new CommandError("PLAYER_NOT_FOUND", describeRejection("PLAYER_NOT_FOUND", snap.rules));
        if (player.status === "SOLD") throw new CommandError("PLAYER_ALREADY_SOLD", describeRejection("PLAYER_ALREADY_SOLD", snap.rules));
        if (snap.currentPlayerId !== player.id) throw new CommandError("PLAYER_NOT_SELECTED", describeRejection("PLAYER_NOT_SELECTED", snap.rules));
        await db.batch([
          guard(db, `${S("status")} = 'ACTIVE' AND ${S("current_player_id")} = ?1 AND EXISTS (SELECT 1 FROM auction_players WHERE player_id = ?1 AND status IN ('AVAILABLE','UNSOLD'))`, cmd.playerId),
          db.prepare("UPDATE auction_players SET status = 'UNSOLD', unsold_count = unsold_count + 1 WHERE player_id = ?1").bind(cmd.playerId),
          this.event("PLAYER_UNSOLD", adminId, at, { playerId: cmd.playerId, metadata: { round: player.unsoldCount + 1 } }),
          this.bump(at),
        ]);
        return {};
      }

      case "correct": {
        const key = typeof cmd.idempotencyKey === "string" ? cmd.idempotencyKey.trim() : "";
        if (!KEY.test(key)) throw new CommandError("BAD_REQUEST", "Missing request key. Reload the page and try again.");
        const prior = await this.priorCorrection(key, { action: ["CHANGE_PRICE", "CHANGE_TEAM", "CHANGE_PRICE_TEAM"], saleId: cmd.saleId, teamId: cmd.teamId, price: cmd.price });
        if (prior) return prior;
        if (!validReason(cmd.reason)) throw new CommandError("REASON_REQUIRED", "Give a reason for the correction (5–300 characters).");
        const reason = cmd.reason.trim();

        const sale = await db.prepare("SELECT id, player_id, team_id, sold_price, reversed_at FROM auction_sales WHERE id = ?1").bind(cmd.saleId).first();
        if (!sale) throw new CommandError("SALE_NOT_FOUND", "That sale does not exist.");
        const from = { teamId: String(sale.team_id), price: num(sale.sold_price) };
        const target = snap.teams.find((t) => t.id === cmd.teamId) ?? null;
        const input = {
          rules: snap.rules,
          status: snap.status,
          sale: { ...from, active: !sale.reversed_at },
          target: target ? { id: target.id, initialBudget: target.initialBudget, spent: target.spent, purchased: target.purchased } : null,
          price: cmd.price,
        };
        const rejection = checkCorrection(input);
        if (rejection) {
          const ledger = correctionLedger(input);
          throw new CommandError(rejection, describeRejection(rejection, snap.rules, ledger ? teamPosition(snap.rules, ledger) : undefined));
        }
        const action = correctionAction(from, { teamId: cmd.teamId, price: cmd.price });
        if (!action) throw new CommandError("NO_CHANGE", "Change the team, the price or both.");

        const playerId = String(sale.player_id);
        const newSaleId = crypto.randomUUID();
        // Target team's live sales, not counting the sale being replaced.
        const others = (col: string) => `(SELECT ${col} FROM auction_sales WHERE team_id = ?3 AND reversed_at IS NULL AND id <> ?1)`;
        await db.batch([
          guard(
            db,
            `${S("status")} IN ('ACTIVE','PAUSED')
             AND EXISTS (SELECT 1 FROM auction_sales s JOIN auction_players p ON p.player_id = s.player_id
                         WHERE s.id = ?1 AND s.player_id = ?2 AND s.reversed_at IS NULL AND s.team_id = ?5 AND s.sold_price = ?6
                           AND p.status = 'SOLD' AND p.winning_team_id = s.team_id)
             AND EXISTS (SELECT 1 FROM auction_teams WHERE id = ?3)
             AND ?4 = CAST(?4 AS INTEGER)
             AND ?4 >= ${S("minimum_bid")} AND ?4 <= ${S("maximum_bid")}
             AND ${others("COUNT(*)")} < ${S("players_per_team")}
             AND ?4 <= (SELECT initial_budget FROM auction_teams WHERE id = ?3) - ${others("COALESCE(SUM(sold_price), 0)")}
                       - (${S("players_per_team")} - 1 - ${others("COUNT(*)")}) * ${S("minimum_bid")}`,
            cmd.saleId,
            playerId,
            cmd.teamId,
            cmd.price,
            from.teamId,
            from.price,
          ),
          db.prepare("UPDATE auction_sales SET reversed_at = ?2, reversed_by = ?3, reversal_reason = ?4 WHERE id = ?1").bind(cmd.saleId, at, adminId, `Corrected: ${reason}`),
          db
            .prepare("INSERT INTO auction_sales (id, player_id, team_id, sold_price, confirmed_at, admin_id, idempotency_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
            .bind(newSaleId, playerId, cmd.teamId, cmd.price, at, adminId, `correction-${key}`),
          db.prepare("UPDATE auction_players SET status = 'SOLD', winning_team_id = ?2, sold_price = ?3, sold_at = ?4 WHERE player_id = ?1").bind(playerId, cmd.teamId, cmd.price, at),
          this.correctionRow({ action, playerId, originalSaleId: cmd.saleId, replacementSaleId: newSaleId, fromTeamId: from.teamId, toTeamId: cmd.teamId, fromPrice: from.price, toPrice: cmd.price, reason, adminId, at, key }),
          this.event("SALE_CORRECTED", adminId, at, {
            playerId,
            teamId: cmd.teamId,
            amount: cmd.price,
            metadata: { action, originalSaleId: cmd.saleId, newSaleId, fromTeamId: from.teamId, fromPrice: from.price, reason },
          }),
          this.bump(at),
        ]);
        return { saleId: newSaleId };
      }

      case "undo": {
        const key = typeof cmd.idempotencyKey === "string" ? cmd.idempotencyKey.trim() : "";
        if (!KEY.test(key)) throw new CommandError("BAD_REQUEST", "Missing request key. Reload the page and try again.");
        const prior = await this.priorCorrection(key, { action: ["UNDO_SALE"], saleId: cmd.saleId });
        if (prior) return prior;
        if (!validReason(cmd.reason)) throw new CommandError("REASON_REQUIRED", "Give a reason for undoing the sale (5–300 characters).");
        const reason = cmd.reason.trim();
        if (snap.status !== "ACTIVE" && snap.status !== "PAUSED") throw new CommandError("AUCTION_CLOSED", describeRejection("AUCTION_CLOSED", snap.rules));
        const sale = await db.prepare("SELECT id, player_id, team_id, sold_price, reversed_at FROM auction_sales WHERE id = ?1").bind(cmd.saleId).first();
        if (!sale) throw new CommandError("SALE_NOT_FOUND", "That sale does not exist.");
        if (sale.reversed_at) throw new CommandError("SALE_NOT_ACTIVE", describeRejection("SALE_NOT_ACTIVE", snap.rules));
        const playerId = String(sale.player_id);
        await db.batch([
          guard(
            db,
            `${S("status")} IN ('ACTIVE','PAUSED')
             AND EXISTS (SELECT 1 FROM auction_sales s JOIN auction_players p ON p.player_id = s.player_id
                         WHERE s.id = ?1 AND s.reversed_at IS NULL AND p.status = 'SOLD' AND p.winning_team_id = s.team_id)`,
            cmd.saleId,
          ),
          db.prepare("UPDATE auction_sales SET reversed_at = ?2, reversed_by = ?3, reversal_reason = ?4 WHERE id = ?1").bind(cmd.saleId, at, adminId, `Undone: ${reason}`),
          db.prepare("UPDATE auction_players SET status = 'UNSOLD', winning_team_id = NULL, sold_price = NULL, sold_at = NULL WHERE player_id = ?1").bind(playerId),
          this.correctionRow({ action: "UNDO_SALE", playerId, originalSaleId: cmd.saleId, fromTeamId: String(sale.team_id), fromPrice: num(sale.sold_price), reason, adminId, at, key }),
          this.event("SALE_REVERSED", adminId, at, { playerId, teamId: String(sale.team_id), amount: num(sale.sold_price), metadata: { action: "UNDO_SALE", saleId: cmd.saleId, reason } }),
          this.bump(at),
        ]);
        return { saleId: cmd.saleId };
      }

      case "reopen": {
        const key = typeof cmd.idempotencyKey === "string" ? cmd.idempotencyKey.trim() : "";
        if (!KEY.test(key)) throw new CommandError("BAD_REQUEST", "Missing request key. Reload the page and try again.");
        const prior = await this.priorCorrection(key, { action: ["REOPEN_PLAYER"], playerId: cmd.playerId });
        if (prior) return prior;
        if (!validReason(cmd.reason)) throw new CommandError("REASON_REQUIRED", "Give a reason for reopening the player (5–300 characters).");
        const reason = cmd.reason.trim();
        if (snap.status !== "ACTIVE" && snap.status !== "PAUSED") throw new CommandError("AUCTION_CLOSED", describeRejection("AUCTION_CLOSED", snap.rules));
        const player = snap.players.find((p) => p.id === cmd.playerId);
        if (!player) throw new CommandError("PLAYER_NOT_FOUND", describeRejection("PLAYER_NOT_FOUND", snap.rules));
        if (player.status !== "UNSOLD") throw new CommandError("PLAYER_NOT_UNSOLD", "Only an UNSOLD player can be returned to AVAILABLE.");
        await db.batch([
          guard(db, `${S("status")} IN ('ACTIVE','PAUSED') AND EXISTS (SELECT 1 FROM auction_players WHERE player_id = ?1 AND status = 'UNSOLD')`, cmd.playerId),
          db.prepare("UPDATE auction_players SET status = 'AVAILABLE' WHERE player_id = ?1").bind(cmd.playerId),
          this.correctionRow({ action: "REOPEN_PLAYER", playerId: cmd.playerId, reason, adminId, at, key }),
          this.event("PLAYER_REOPENED", adminId, at, { playerId: cmd.playerId, metadata: { reason, unsoldRounds: player.unsoldCount } }),
          this.bump(at),
        ]);
        return {};
      }
    }
  }
}
