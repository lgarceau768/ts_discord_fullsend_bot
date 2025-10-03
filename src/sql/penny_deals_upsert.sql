INSERT INTO penny_deals (
  sku,
  retailer,
  store_id,
  zip,
  title,
  price,
  distance_miles,
  last_seen_at,
  metadata,
  updated_at
)
VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  $7,
  $8,
  $9,
  NOW()
)
ON CONFLICT (sku, retailer, store_id)
DO UPDATE SET
  zip = EXCLUDED.zip,
  title = EXCLUDED.title,
  price = EXCLUDED.price,
  distance_miles = EXCLUDED.distance_miles,
  last_seen_at = GREATEST(penny_deals.last_seen_at, EXCLUDED.last_seen_at),
  metadata = COALESCE(EXCLUDED.metadata, penny_deals.metadata),
  updated_at = NOW()
RETURNING *;
