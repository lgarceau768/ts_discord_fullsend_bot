INSERT INTO cd_watches (user_id, user_tag, watch_uuid, url, tags)
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT (watch_uuid) DO NOTHING;
