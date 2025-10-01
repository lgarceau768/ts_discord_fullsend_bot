SELECT id,
       plant_id,
       user_id,
       channel_id,
       guild_id,
       enabled,
       time,
       water_interval_days
FROM plant_reminders
WHERE enabled IS TRUE
ORDER BY id;
