export interface PlantReminderRow {
  id: number;
  plant_id: number;
  user_id: string;
  channel_id: string | null;
  guild_id: string | null;
  enabled: boolean | null;
  time: string | null;
  water_interval_days: number | null;
}

export interface PlantReminderPlant {
  id: number;
  name: string;
  photo_url?: string;
  photoUrl?: string;
  notes?: string;
  location?: string;
  light?: string;
  water_interval_days?: number | null;
  last_watered_at?: string | null;
  next_water_due_at?: string | null;
  state?: string | null;
}
