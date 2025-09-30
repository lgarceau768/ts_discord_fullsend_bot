-- plants
CREATE TABLE IF NOT EXISTS plants (
  id int4range PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  species TEXT,
  location TEXT,
  light TEXT,                      -- low | medium | bright | direct
  notes TEXT,
  photo_url TEXT,
  water_interval_days INT,         -- e.g., 7
  last_watered_at TIMESTAMPTZ,
  next_water_due_at TIMESTAMPTZ,
  state TEXT,                      -- ok | thirsty | overwatered | repot-soon | pest-risk
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- water logs
CREATE TABLE IF NOT EXISTS water_logs (
  id int PRIMARY KEY,
  plant_id INT NOT NULL,
  user_id TEXT NOT NULL,
  amount_l NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- reminders (one per plant/user)
CREATE TABLE IF NOT EXISTS plant_reminders (
  id int PRIMARY KEY,
  plant_id INT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT,
  guild_id TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  time TEXT,                       -- "09:00"
  water_interval_days INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plant_id, user_id)
);