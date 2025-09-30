DELETE FROM cd_watches
WHERE user_id=$1 AND watch_uuid=$2;
