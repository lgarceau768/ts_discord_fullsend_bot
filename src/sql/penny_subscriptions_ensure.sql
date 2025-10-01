CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS penny_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  zip TEXT NOT NULL,
  retailer TEXT NOT NULL DEFAULT '',
  keyword TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL DEFAULT '',
  guild_id TEXT NOT NULL DEFAULT '',
  notify_via_dm BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, zip, retailer, keyword, channel_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_penny_subscriptions_user ON penny_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_penny_subscriptions_zip ON penny_subscriptions (zip);
