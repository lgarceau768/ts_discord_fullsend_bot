import { EmbedBuilder, type Client } from 'discord.js';
import pg from 'pg';

import { logger } from '../logger.js';
import { loggedFetch } from '../utils/loggedFetch.js';

interface ReminderRow {
  id: number;
  plant_id: number;
  user_id: string;
  channel_id: string | null;
  guild_id: string | null;
  enabled: boolean | null;
  time: string | null; // "HH:mm"
  water_interval_days: number | null;
}

interface PlantGet {
  id: number;
  name: string;
  photo_url?: string;
  photoUrl?: string;
  notes?: string;
  location?: string;
  light?: string;
  water_interval_days?: number | null;
  last_watered_at?: string | null; // ISO
  next_water_due_at?: string | null; // ISO
  state?: string | null;
}

const TZ = (process.env.REMINDER_TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: /^\s*(true|1|yes|on)\s*$/i.test(process.env.PGSSL ?? '')
    ? { rejectUnauthorized: false }
    : undefined,
});

// Very small in-memory “already notified today” map: key = `${plantId}:${YYYY-MM-DD}`
const notifiedToday = new Set<string>();

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Compute local time HH:mm for comparison against reminder.time (string)
function localHHmm(date = new Date()): string {
  // Render in TZ without external libs
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  // Some environments include a narrow no-break space; normalize
  return fmt.format(date).replace(/[\u202F\u00A0]/g, '');
}

async function plantApiGet(id: number, userId: string): Promise<PlantGet> {
  const url = process.env.N8N_PLANT_API_URL;
  if (!url) throw new Error('N8N_PLANT_API_URL not configured');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.N8N_API_KEY) headers.Authorization = `Bearer ${process.env.N8N_API_KEY}`;

  const res = await loggedFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'get', id, userId }),
  });
  const json: unknown = await res.json().catch(() => ({}));
  const payload = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const okValue = payload.ok;
  if (!res.ok || okValue === false) {
    const errorMessage =
      typeof payload.error === 'string' ? payload.error : `n8n get failed: ${res.status}`;
    throw new Error(errorMessage);
  }
  const data = payload.data;
  if (data && typeof data === 'object') {
    return data as PlantGet;
  }
  return payload as unknown as PlantGet;
}

// Decide if plant is due now. If plant.next_water_due_at exists: due if <= now.
// Else, fall back to (last_watered_at + interval) if available.
function isDueNow(
  plant: PlantGet,
  reminderIntervalDays?: number | null,
  now = new Date(),
): boolean {
  const nextIso = plant.next_water_due_at;
  if (nextIso) {
    const next = new Date(nextIso);
    return !Number.isNaN(next.getTime()) && next.getTime() <= now.getTime();
  }
  // Fallback: compute from last_watered_at + (reminder interval || plant interval)
  const intervalDays =
    (typeof reminderIntervalDays === 'number' ? reminderIntervalDays : null) ??
    (typeof plant.water_interval_days === 'number' ? plant.water_interval_days : null);

  if (!intervalDays || !plant.last_watered_at) return false;

  const last = new Date(plant.last_watered_at);
  if (Number.isNaN(last.getTime())) return false;

  const next = new Date(last);
  next.setUTCDate(next.getUTCDate() + intervalDays);
  return next.getTime() <= now.getTime();
}

async function fetchEnabledReminders(): Promise<ReminderRow[]> {
  const q = `
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
    ORDER BY id
  `;
  const { rows } = await pool.query<ReminderRow>(q);
  return rows;
}

async function sendReminder(client: Client, r: ReminderRow, plant: PlantGet) {
  if (!r.channel_id) return;

  const ch = await client.channels.fetch(r.channel_id).catch(() => null);
  if (!ch?.isTextBased()) return;

  const photo = plant.photo_url ?? plant.photoUrl;
  const embed = new EmbedBuilder()
    .setTitle(`🌿 Watering reminder — ${plant.name} (ID ${plant.id})`)
    .setDescription(
      [
        plant.location ? `**Location:** ${plant.location}` : null,
        plant.light ? `**Light:** ${plant.light}` : null,
        plant.next_water_due_at
          ? `**Next due:** ${new Date(plant.next_water_due_at).toLocaleString()}`
          : null,
        plant.state ? `**State:** ${plant.state}` : null,
        plant.notes ? `\n${plant.notes.slice(0, 300)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setFooter({ text: 'Mark watered with /plant water id:<plantId>' });

  if (photo) embed.setThumbnail(photo);

  const msg =
    `Hey <@${r.user_id}>, ${plant.name} looks due for care. ` +
    `Use \`/plant water id:${plant.id}\` when you’re done.`;

  if (ch.isTextBased() && ch.isSendable()) {
    await ch.send({ content: msg, embeds: [embed] }); // ✅ OK
  }
}

async function processOneHour(client: Client) {
  const now = new Date();
  const today = ymd(now);
  const hhmm = localHHmm(now);

  const reminders = await fetchEnabledReminders();

  // Log current set
  logger.info(
    {
      isoTime: now.toISOString(),
      timeZone: TZ,
      reminderCount: reminders.length,
      targetTime: hhmm,
    },
    '[plant-reminders] scanning reminders',
  );
  reminders.forEach((reminder) => {
    logger.debug(
      {
        id: reminder.id,
        plantId: reminder.plant_id,
        userId: reminder.user_id,
        channelId: reminder.channel_id,
        time: reminder.time,
        intervalDays: reminder.water_interval_days,
      },
      '[plant-reminders] reminder entry',
    );
  });

  for (const r of reminders) {
    // If a specific HH:mm is set, only run at that minute; if null, treat as “any top of hour”
    const dueThisMinute = (r.time && r.time.trim() === hhmm) ?? (!r.time && hhmm.endsWith(':00')); // run at top of hour if no time configured

    if (!dueThisMinute) continue;

    // basic de-dup per plant per day
    const key = `${r.plant_id}:${today}`;
    if (notifiedToday.has(key)) continue;

    // Fetch plant state from n8n
    let plant: PlantGet;
    try {
      plant = await plantApiGet(r.plant_id, r.user_id);
    } catch (error: unknown) {
      logger.warn({ plantId: r.plant_id, error }, '[plant-reminders] get plant failed');
      continue;
    }

    if (isDueNow(plant, r.water_interval_days, now)) {
      try {
        await sendReminder(client, r, plant);
        notifiedToday.add(key);
        logger.info({ plantId: r.plant_id, time: hhmm }, '[plant-reminders] reminder sent');
      } catch (error: unknown) {
        logger.warn({ plantId: r.plant_id, error }, '[plant-reminders] send failed');
      }
    }
  }

  // Simple cleanup: keep set from growing beyond a day
  // (Reset the set when the date changes)
  const resetAt = new Date(now);
  resetAt.setUTCHours(23, 59, 59, 999);
  // No action needed here; on next process call (new day), keys won’t match today’s ymd.
}

/** Kicks off the hourly schedule. */
export function initPlantReminderJob(client: Client) {
  // Run immediately on boot (so you don't wait an hour)
  logger.info('[Plant Reminder Job] starting initial execution');
  processOneHour(client).catch((error: unknown) =>
    logger.warn({ error }, '[plant-reminders] initial run error'),
  );

  // Schedule: align to top of next hour, then run every hour
  const now = Date.now();
  const msToNextHour = 60 * 60 * 1000 - (now % (60 * 60 * 1000));
  setTimeout(() => {
    processOneHour(client).catch((error: unknown) =>
      logger.warn({ error }, '[plant-reminders] scheduled run error'),
    );
    setInterval(
      () => {
        processOneHour(client).catch((error: unknown) =>
          logger.warn({ error }, '[plant-reminders] hourly run error'),
        );
      },
      60 * 60 * 1000,
    );
  }, msToNextHour);
}
