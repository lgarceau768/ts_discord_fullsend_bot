CREATE TABLE IF NOT EXISTS penny_deals (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL,
  retailer TEXT NOT NULL,
  store_id TEXT NOT NULL,
  zip TEXT NOT NULL,
  title TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  distance_miles NUMERIC(6, 2),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sku, retailer, store_id)
);

CREATE INDEX IF NOT EXISTS idx_penny_deals_zip ON penny_deals (zip);
CREATE INDEX IF NOT EXISTS idx_penny_deals_last_seen ON penny_deals (last_seen_at DESC);
