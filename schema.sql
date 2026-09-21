-- /family gallery — D1 schema
-- Apply: wrangler d1 execute family-gallery --remote --file=schema.sql
-- (drop --remote for the local dev database)

CREATE TABLE IF NOT EXISTS folders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,           -- top-level drive folder, e.g. "Dad's Oppo Nov23"
  photo_count INTEGER NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id    INTEGER NOT NULL REFERENCES folders(id),
  rel_path     TEXT UNIQUE NOT NULL,          -- path relative to the drive's photos/ root
  kind         TEXT NOT NULL CHECK (kind IN ('photo','video')),
  content_hash TEXT UNIQUE NOT NULL,          -- sha256 of original bytes (ingest idempotency)
  rating       REAL NOT NULL DEFAULT 1500,
  votes        INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  duration_s   REAL,                          -- videos only
  taken_at     INTEGER,                       -- unix epoch from EXIF, when available
  marked_at    INTEGER,                       -- dustbin-marked for deletion; NULL = in play
  kept_at      INTEGER,                       -- trash review said "keep"; exempts from the 3-loss auto-flag
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_media_kind_rating ON media(kind, rating);
CREATE INDEX IF NOT EXISTS idx_media_kind_votes  ON media(kind, votes);
CREATE INDEX IF NOT EXISTS idx_media_folder      ON media(folder_id, kind);

CREATE TABLE IF NOT EXISTS voters (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id             INTEGER NOT NULL REFERENCES voters(id),
  winner_id            INTEGER NOT NULL REFERENCES media(id),
  loser_id             INTEGER NOT NULL REFERENCES media(id),
  winner_rating_before REAL NOT NULL,
  loser_rating_before  REAL NOT NULL,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (winner_id != loser_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id);

INSERT OR IGNORE INTO voters (name) VALUES
  ('Pulkit'), ('Karishma'), ('Medha'), ('Mom'), ('Dad');
