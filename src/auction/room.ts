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
  checkSale,
  checkStart,
  describeRejection,
  describeTransition,
  teamPosition,
  transitionTarget,
  type AuctionPlayerStatus,
  type AuctionRules,
  type AuctionStatus,
  type CompletionInput,
} from "./rules";
import type { AuctionAdminDetail, AuctionCommand, AuctionEventView, AuctionSnapshot, AuctionTeamView, CommandResult } from "./types";

declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } };

const MAX_SOCKETS = 400;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 40; // commands per admin per window (a person needs far fewer)
const PRESENTER_EVENTS = ["PLAYER_SELECTED", "PLAYER_SOLD", "PLAYER_UNSOLD", "SALE_REVERSED", "AUCTION_STARTED", "AUCTION_PAUSED", "AUCTION_RESUMED", "AUCTION_COMPLETED"];

const now = () => new Date().toISOString();
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

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
          const result = await this.serial(() => this.execute(adminId, command));
          return Response.json(result, { status: result.ok ? 200 : 409 });
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

  private broadcast(snapshot: AuctionSnapshot) {
    const message = JSON.stringify({ type: "state", snapshot });
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
    const [settingsR, teamsR, iconsR, playersR, ledgerR, recentR, eventR] = await this.db.batch([
      this.db.prepare("SELECT * FROM auction_settings WHERE id = 1"),
      this.db.prepare("SELECT id, team_name, initial_budget, sort_order FROM auction_teams ORDER BY sort_order"),
      this.db.prepare("SELECT team_id, icon_name FROM auction_icons"),
      this.db.prepare("SELECT * FROM auction_players ORDER BY sheet_order"),
      this.db.prepare("SELECT team_id, COUNT(*) AS n, SUM(sold_price) AS spent FROM auction_sales WHERE reversed_at IS NULL GROUP BY team_id"),
      this.db.prepare("SELECT id, player_id, team_id, sold_price, confirmed_at FROM auction_sales WHERE reversed_at IS NULL ORDER BY confirmed_at DESC, rowid DESC LIMIT 10"),
      this.db
        .prepare(`SELECT event_id, event_type, player_id, team_id, amount, timestamp FROM auction_events WHERE event_type IN (${PRESENTER_EVENTS.map(() => "?").join(",")}) ORDER BY event_id DESC LIMIT 1`)
        .bind(...PRESENTER_EVENTS),
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
    };
  }

  private async adminDetail(): Promise<AuctionAdminDetail> {
    const [eventsR, salesR] = await this.db.batch([
      this.db.prepare("SELECT * FROM auction_events ORDER BY event_id DESC LIMIT 80"),
      this.db.prepare("SELECT * FROM auction_sales ORDER BY confirmed_at DESC, rowid DESC"),
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
    };
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

      case "reverse": {
        const reason = typeof cmd.reason === "string" ? cmd.reason.trim() : "";
        if (reason.length < 5 || reason.length > 300) throw new CommandError("REASON_REQUIRED", "Give a reason for the correction (5–300 characters).");
        if (snap.status !== "ACTIVE" && snap.status !== "PAUSED") throw new CommandError("INVALID_TRANSITION", "Sales can only be corrected while the auction is running or paused.");
        const sale = await db.prepare("SELECT id, player_id, team_id, sold_price, reversed_at FROM auction_sales WHERE id = ?1").bind(cmd.saleId).first();
        if (!sale) throw new CommandError("SALE_NOT_FOUND", "That sale does not exist.");
        if (sale.reversed_at) throw new CommandError("ALREADY_REVERSED", "That sale has already been reversed.");
        await db.batch([
          guard(
            db,
            `${S("status")} IN ('ACTIVE','PAUSED')
             AND EXISTS (SELECT 1 FROM auction_sales s JOIN auction_players p ON p.player_id = s.player_id
                         WHERE s.id = ?1 AND s.reversed_at IS NULL AND p.status = 'SOLD' AND p.winning_team_id = s.team_id)`,
            cmd.saleId,
          ),
          db.prepare("UPDATE auction_sales SET reversed_at = ?2, reversed_by = ?3, reversal_reason = ?4 WHERE id = ?1").bind(cmd.saleId, at, adminId, reason),
          db
            .prepare(
              "UPDATE auction_players SET status = CASE WHEN unsold_count > 0 THEN 'UNSOLD' ELSE 'AVAILABLE' END, winning_team_id = NULL, sold_price = NULL, sold_at = NULL WHERE player_id = ?1",
            )
            .bind(String(sale.player_id)),
          this.event("SALE_REVERSED", adminId, at, { playerId: String(sale.player_id), teamId: String(sale.team_id), amount: num(sale.sold_price), metadata: { saleId: cmd.saleId, reason } }),
          this.bump(at),
        ]);
        return { saleId: cmd.saleId };
      }
    }
  }
}
