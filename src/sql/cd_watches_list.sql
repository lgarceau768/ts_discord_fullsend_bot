SELECT watch_uuid, url, tags, created_at
FROM cd_watches
WHERE user_id=$1
ORDER BY created_at DESC
LIMIT 25;
