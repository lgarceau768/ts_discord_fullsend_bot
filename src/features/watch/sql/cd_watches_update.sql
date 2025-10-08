UPDATE cd_watches
SET tags = $3
WHERE user_id = $1 AND watch_uuid = $2;
