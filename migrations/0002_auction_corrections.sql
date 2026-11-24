-- FPL Season 4 auction: corrections (change price/team, undo sale, reopen unsold player).
--
-- 1. auction_events: allow two new audit event types (SALE_CORRECTED, PLAYER_REOPENED).
--    SQLite cannot alter a CHECK constraint, so the table is rebuilt: every existing row is
--    copied with its original event_id, then the append-only triggers are recreated.
--    (DROP TABLE does not fire the delete trigger; no other table references auction_events.)
-- 2. auction_corrections: append-only record of every correction, with its reason, admin,
--    time, the original and replacement sale, and a unique idempotency key.
-- Existing sales, players, teams, icons and settings are not touched.

CREATE TABLE auction_events_v2 (
  event_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'POOL_LOADED','AUCTION_STARTED','AUCTION_PAUSED','AUCTION_RESUMED','PLAYER_SELECTED',
    'PLAYER_SOLD','PLAYER_UNSOLD','SALE_REVERSED','AUCTION_COMPLETED',
    'SALE_CORRECTED','PLAYER_REOPENED')),
  player_id  TEXT,
  team_id    TEXT,
  amount     INTEGER,
  admin_id   TEXT NOT NULL,
  timestamp  TEXT NOT NULL,
  metadata   TEXT
);

INSERT INTO auction_events_v2 (event_id, event_type, player_id, team_id, amount, admin_id, timestamp, metadata)
SELECT event_id, event_type, player_id, team_id, amount, admin_id, timestamp, metadata FROM auction_events ORDER BY event_id;

DROP TABLE auction_events;
ALTER TABLE auction_events_v2 RENAME TO auction_events;

CREATE TRIGGER auction_events_no_update BEFORE UPDATE ON auction_events
BEGIN
  SELECT RAISE(ABORT, 'auction_events is append-only');
END;
CREATE TRIGGER auction_events_no_delete BEFORE DELETE ON auction_events
BEGIN
  SELECT RAISE(ABORT, 'auction_events is append-only');
END;

CREATE TABLE auction_corrections (
  id                  TEXT PRIMARY KEY,
  action              TEXT NOT NULL CHECK (action IN ('CHANGE_PRICE','CHANGE_TEAM','CHANGE_PRICE_TEAM','UNDO_SALE','REOPEN_PLAYER')),
  player_id           TEXT NOT NULL REFERENCES auction_players(player_id),
  original_sale_id    TEXT REFERENCES auction_sales(id),
  replacement_sale_id TEXT UNIQUE REFERENCES auction_sales(id),
  from_team_id        TEXT REFERENCES auction_teams(id),
  to_team_id          TEXT REFERENCES auction_teams(id),
  from_price          INTEGER,
  to_price            INTEGER CHECK (to_price IS NULL OR (to_price > 0 AND to_price = CAST(to_price AS INTEGER))),
  reason              TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 300),
  admin_id            TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  idempotency_key     TEXT NOT NULL UNIQUE,
  -- Each action carries exactly the fields it needs.
  CHECK (
    (action IN ('CHANGE_PRICE','CHANGE_TEAM','CHANGE_PRICE_TEAM')
      AND original_sale_id IS NOT NULL AND replacement_sale_id IS NOT NULL
      AND from_team_id IS NOT NULL AND to_team_id IS NOT NULL AND from_price IS NOT NULL AND to_price IS NOT NULL)
    OR (action = 'UNDO_SALE'
      AND original_sale_id IS NOT NULL AND replacement_sale_id IS NULL
      AND from_team_id IS NOT NULL AND to_team_id IS NULL AND from_price IS NOT NULL AND to_price IS NULL)
    OR (action = 'REOPEN_PLAYER'
      AND original_sale_id IS NULL AND replacement_sale_id IS NULL
      AND from_team_id IS NULL AND to_team_id IS NULL AND from_price IS NULL AND to_price IS NULL)
  ),
  CHECK (action <> 'CHANGE_PRICE' OR (from_team_id = to_team_id AND from_price <> to_price)),
  CHECK (action <> 'CHANGE_TEAM' OR (from_team_id <> to_team_id AND from_price = to_price)),
  CHECK (action <> 'CHANGE_PRICE_TEAM' OR (from_team_id <> to_team_id AND from_price <> to_price))
);
-- A sale can be corrected or undone only once.
CREATE UNIQUE INDEX auction_corrections_one_per_sale ON auction_corrections(original_sale_id) WHERE original_sale_id IS NOT NULL;
CREATE INDEX auction_corrections_player ON auction_corrections(player_id);

CREATE TRIGGER auction_corrections_no_update BEFORE UPDATE ON auction_corrections
BEGIN
  SELECT RAISE(ABORT, 'auction_corrections is append-only');
END;
CREATE TRIGGER auction_corrections_no_delete BEFORE DELETE ON auction_corrections
BEGIN
  SELECT RAISE(ABORT, 'auction_corrections is append-only');
END;
