CREATE TABLE IF NOT EXISTS cd_watches (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_tag TEXT NOT NULL,
  watch_uuid TEXT NOT NULL,
  url TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cd_watches_user_idx ON cd_watches (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS cd_watches_uuid_idx ON cd_watches (watch_uuid);
