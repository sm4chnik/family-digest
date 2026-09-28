-- Family Digest Bot — initial schema (see docs/ARCHITECTURE.md)

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT,
  dnd_enabled INTEGER NOT NULL DEFAULT 0 CHECK (dnd_enabled IN (0, 1)),
  dnd_start_minute INTEGER CHECK (dnd_start_minute IS NULL OR (dnd_start_minute >= 0 AND dnd_start_minute < 1440)),
  dnd_end_minute INTEGER CHECK (dnd_end_minute IS NULL OR (dnd_end_minute >= 0 AND dnd_end_minute < 1440)),
  onboarded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('round_interval_hours', '2'),
  ('submission_window_minutes', '30'),
  ('soft_ping_after_minutes', '20');

CREATE TABLE rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  window_ends_at TEXT NOT NULL,
  soft_ping_at TEXT NOT NULL,
  soft_ping_sent_at TEXT,
  closed_at TEXT,
  published_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'closing', 'published'))
);

CREATE INDEX rounds_status_idx ON rounds (status);
CREATE INDEX rounds_started_at_idx ON rounds (started_at);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users (telegram_id),
  -- Round that was open when received (informational); may be null if none
  round_id INTEGER REFERENCES rounds (id),
  -- Digest this media should appear in; null = late queue awaiting next round
  target_round_id INTEGER REFERENCES rounds (id),
  telegram_file_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video', 'video_note')),
  received_at TEXT NOT NULL,
  published_at TEXT,
  channel_message_id INTEGER
);

CREATE INDEX submissions_target_round_idx ON submissions (target_round_id);
CREATE INDEX submissions_user_round_idx ON submissions (user_id, target_round_id);
CREATE INDEX submissions_unpublished_idx ON submissions (published_at);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds (id),
  user_id INTEGER NOT NULL REFERENCES users (telegram_id),
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'soft_ping')),
  sent_at TEXT NOT NULL,
  UNIQUE (round_id, user_id, kind)
);
