SELECT watch_uuid, url, tags, created_at
FROM cd_watches
WHERE user_id = $1 AND watch_uuid = $2
LIMIT 1;
