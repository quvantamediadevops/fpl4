-- FPL Season 4 auction: authorised HARD RESET support.
--
-- 1. auction_admin_audit: append-only record of administrative resets (who, when, which database,
--    which backup, result). It is NOT auction history and a reset never clears it.
-- 2. auction_reset_guard: holds a row only inside the reset transaction. The three delete-blocking
--    triggers from 0001/0002 are recreated so that sales, audit events and corrections can be deleted
--    ONLY while that row exists. The reset inserts the row, clears the history and deletes the row
--    within one D1 batch (one transaction), so outside a reset the history stays undeletable.
--    The guard row is accepted only for a reset with a STARTED (and no COMPLETED/FAILED) audit record.
-- No table is dropped; no existing row is changed. 0001 and 0002 are untouched.

CREATE TABLE auction_admin_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('AUCTION_RESET')),
  phase         TEXT NOT NULL CHECK (phase IN ('STARTED','COMPLETED','FAILED')),
  admin_id      TEXT NOT NULL,
  environment   TEXT NOT NULL CHECK (environment IN ('LOCAL','PRODUCTION')),
  database_ref  TEXT NOT NULL,
  backup_ref    TEXT,
  backup_sha256 TEXT,
  backup_bytes  INTEGER,
  detail        TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (request_id, phase)
);
CREATE INDEX auction_admin_audit_recent ON auction_admin_audit(action, phase, created_at);

CREATE TRIGGER auction_admin_audit_no_update BEFORE UPDATE ON auction_admin_audit
BEGIN
  SELECT RAISE(ABORT, 'auction_admin_audit is append-only');
END;
CREATE TRIGGER auction_admin_audit_no_delete BEFORE DELETE ON auction_admin_audit
BEGIN
  SELECT RAISE(ABORT, 'auction_admin_audit is append-only');
END;

CREATE TABLE auction_reset_guard (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  request_id TEXT NOT NULL
);
-- The guard can only be raised for an audited reset that has started and not yet completed,
-- so history can never be cleared without a matching admin audit record.
CREATE TRIGGER auction_reset_guard_audited BEFORE INSERT ON auction_reset_guard
WHEN NOT EXISTS (SELECT 1 FROM auction_admin_audit WHERE request_id = NEW.request_id AND action = 'AUCTION_RESET' AND phase = 'STARTED')
  OR EXISTS (SELECT 1 FROM auction_admin_audit WHERE request_id = NEW.request_id AND phase IN ('COMPLETED','FAILED'))
BEGIN
  SELECT RAISE(ABORT, 'auction_reset_guard requires a started, unfinished, audited reset');
END;

DROP TRIGGER auction_sales_no_delete;
CREATE TRIGGER auction_sales_no_delete BEFORE DELETE ON auction_sales
WHEN NOT EXISTS (SELECT 1 FROM auction_reset_guard)
BEGIN
  SELECT RAISE(ABORT, 'auction_sales rows cannot be deleted');
END;

DROP TRIGGER auction_events_no_delete;
CREATE TRIGGER auction_events_no_delete BEFORE DELETE ON auction_events
WHEN NOT EXISTS (SELECT 1 FROM auction_reset_guard)
BEGIN
  SELECT RAISE(ABORT, 'auction_events is append-only');
END;

DROP TRIGGER auction_corrections_no_delete;
CREATE TRIGGER auction_corrections_no_delete BEFORE DELETE ON auction_corrections
WHEN NOT EXISTS (SELECT 1 FROM auction_reset_guard)
BEGIN
  SELECT RAISE(ABORT, 'auction_corrections is append-only');
END;
