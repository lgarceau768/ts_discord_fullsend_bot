SELECT
  id,
  user_id,
  zip,
  retailer,
  keyword,
  channel_id,
  guild_id,
  notify_via_dm,
  is_active,
  created_at,
  updated_at
FROM penny_subscriptions
WHERE user_id = $1
  AND ($2::BOOLEAN IS TRUE OR is_active = TRUE)
ORDER BY created_at DESC;
