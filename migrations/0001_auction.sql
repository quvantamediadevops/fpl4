-- FPL Season 4 physical auction. D1 is the permanent record; the AuctionRoom
-- Durable Object serialises every write. The constraints below are a second
-- line of defence: they reject an invalid state even if application code is wrong.

-- Single row: rules and live status. Rule values are set here once and read by
-- every client from the database; nothing is hardcoded in the UI.
CREATE TABLE auction_settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  status           TEXT    NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','ACTIVE','PAUSED','COMPLETED')),
  team_budget      INTEGER NOT NULL CHECK (team_budget > 0),
  players_per_team INTEGER NOT NULL CHECK (players_per_team > 0),   -- auction purchases per team (icon excluded)
  minimum_bid      INTEGER NOT NULL CHECK (minimum_bid > 0),
  maximum_bid      INTEGER NOT NULL CHECK (maximum_bid >= minimum_bid),
  current_player_id TEXT,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

-- Any whole-rupee price from minimum_bid to maximum_bid is allowed.
INSERT INTO auction_settings (id, team_budget, players_per_team, minimum_bid, maximum_bid, created_at, updated_at)
VALUES (1, 4000, 11, 100, 3000, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- One row per official team. Name, logo and owner stay in src/config/tournament.ts;
-- `id` is that team's slug.
CREATE TABLE auction_teams (
  id             TEXT    PRIMARY KEY,
  team_name      TEXT    NOT NULL,
  initial_budget INTEGER NOT NULL CHECK (initial_budget > 0),
  sort_order     INTEGER NOT NULL,
  created_at     TEXT    NOT NULL
);

-- Pre-assigned icon player per team (official mapping in src/config/tournament.ts).
-- Icons are not registrations: they are never in auction_players, never sold, and cost nothing.
CREATE TABLE auction_icons (
  team_id    TEXT PRIMARY KEY REFERENCES auction_teams(id),
  icon_name  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Auction pool, frozen from the registration list when the pool is loaded.
-- Only public fields: id, display name, role and the photo-proxy key.
CREATE TABLE auction_players (
  player_id       TEXT    PRIMARY KEY,
  photo_key       TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  role            TEXT    CHECK (role IN ('BATSMAN','BOWLER','ALL ROUNDER')),
  sheet_order     INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','SOLD','UNSOLD')),
  winning_team_id TEXT    REFERENCES auction_teams(id),
  sold_price      INTEGER CHECK (sold_price IS NULL OR (sold_price > 0 AND sold_price = CAST(sold_price AS INTEGER))),
  sold_at         TEXT,
  unsold_count    INTEGER NOT NULL DEFAULT 0,
  CHECK ((status = 'SOLD') = (winning_team_id IS NOT NULL AND sold_price IS NOT NULL AND sold_at IS NOT NULL))
);

-- Every confirmed sale. Never deleted: a correction sets reversed_* instead.
CREATE TABLE auction_sales (
  id              TEXT    PRIMARY KEY,
  player_id       TEXT    NOT NULL REFERENCES auction_players(player_id),
  team_id         TEXT    NOT NULL REFERENCES auction_teams(id),
  sold_price      INTEGER NOT NULL CHECK (sold_price > 0 AND sold_price = CAST(sold_price AS INTEGER)),
  confirmed_at    TEXT    NOT NULL,
  admin_id        TEXT    NOT NULL,
  idempotency_key TEXT    NOT NULL UNIQUE,
  reversed_at     TEXT,
  reversed_by     TEXT,
  reversal_reason TEXT,
  CHECK ((reversed_at IS NULL) = (reversed_by IS NULL) AND (reversed_at IS NULL) = (reversal_reason IS NULL))
);
-- A player can have at most one live (unreversed) sale.
CREATE UNIQUE INDEX auction_sales_one_live_per_player ON auction_sales(player_id) WHERE reversed_at IS NULL;
CREATE INDEX auction_sales_team ON auction_sales(team_id) WHERE reversed_at IS NULL;

-- A sale may only be reversed once, and nothing else about it may change.
CREATE TRIGGER auction_sales_guard_update BEFORE UPDATE ON auction_sales
WHEN OLD.reversed_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.player_id IS NOT OLD.player_id OR NEW.team_id IS NOT OLD.team_id
  OR NEW.sold_price IS NOT OLD.sold_price OR NEW.confirmed_at IS NOT OLD.confirmed_at
  OR NEW.admin_id IS NOT OLD.admin_id OR NEW.idempotency_key IS NOT OLD.idempotency_key
BEGIN
  SELECT RAISE(ABORT, 'auction_sales rows are immutable; only a single reversal is allowed');
END;
CREATE TRIGGER auction_sales_no_delete BEFORE DELETE ON auction_sales
BEGIN
  SELECT RAISE(ABORT, 'auction_sales rows cannot be deleted');
END;

-- Immutable audit history.
CREATE TABLE auction_events (
  event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'POOL_LOADED','AUCTION_STARTED','AUCTION_PAUSED','AUCTION_RESUMED','PLAYER_SELECTED',
    'PLAYER_SOLD','PLAYER_UNSOLD','SALE_REVERSED','AUCTION_COMPLETED')),
  player_id  TEXT,
  team_id    TEXT,
  amount     INTEGER,
  admin_id   TEXT NOT NULL,
  timestamp  TEXT NOT NULL,
  metadata   TEXT
);
CREATE TRIGGER auction_events_no_update BEFORE UPDATE ON auction_events
BEGIN
  SELECT RAISE(ABORT, 'auction_events is append-only');
END;
CREATE TRIGGER auction_events_no_delete BEFORE DELETE ON auction_events
BEGIN
  SELECT RAISE(ABORT, 'auction_events is append-only');
END;

-- Admin sessions: only a SHA-256 of the cookie token is stored.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

-- Failed login attempts, for rate limiting (by hashed client IP).
CREATE TABLE admin_login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX admin_login_attempts_ip ON admin_login_attempts(ip_hash, created_at);
