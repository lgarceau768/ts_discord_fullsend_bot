SELECT
  id,
  sku,
  retailer,
  store_id,
  zip,
  title,
  price,
  distance_miles,
  last_seen_at,
  metadata,
  created_at,
  updated_at
FROM penny_deals
WHERE zip = $1
  AND ($2::TEXT IS NULL OR retailer = $2)
ORDER BY last_seen_at DESC
LIMIT COALESCE($3::INT, 20);
