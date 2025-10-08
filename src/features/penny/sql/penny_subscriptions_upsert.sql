INSERT INTO penny_subscriptions (
  id,
  user_id,
  zip,
  retailer,
  keyword,
  channel_id,
  guild_id,
  notify_via_dm,
  is_active,
  updated_at
)
VALUES (
  COALESCE($1::UUID, gen_random_uuid()),
  $2,
  $3,
  COALESCE($4, ''),
  COALESCE($5, ''),
  COALESCE($6, ''),
  COALESCE($7, ''),
  COALESCE($8, FALSE),
  COALESCE($9, TRUE),
  NOW()
)
ON CONFLICT (user_id, zip, retailer, keyword, channel_id, guild_id)
DO UPDATE SET
  notify_via_dm = EXCLUDED.notify_via_dm,
  is_active = TRUE,
  updated_at = NOW()
RETURNING *;
