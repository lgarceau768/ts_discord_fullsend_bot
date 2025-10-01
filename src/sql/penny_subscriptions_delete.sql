UPDATE penny_subscriptions
SET is_active = FALSE,
    updated_at = NOW()
WHERE id = $1::UUID
  AND user_id = $2
RETURNING *;
