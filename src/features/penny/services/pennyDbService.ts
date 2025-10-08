import pg from 'pg';

import { logger } from '../../../core/logger.js';
import { readSqlFile } from '../../../core/utils/sql.js';
import type {
  PennyDeal,
  PennyDealUpsert,
  PennySubscription,
  PennySubscriptionInput,
  PennyRetailer,
} from '../types/penny.js';

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

type SqlMap = Record<string, string>;

const SQL_FILES: [string, string][] = [
  ['ensureDeals', 'penny_deals_ensure.sql'],
  ['upsertDeal', 'penny_deals_upsert.sql'],
  ['recentDeals', 'penny_deals_recent.sql'],
  ['ensureSubs', 'penny_subscriptions_ensure.sql'],
  ['upsertSub', 'penny_subscriptions_upsert.sql'],
  ['deleteSub', 'penny_subscriptions_delete.sql'],
  ['subsByUser', 'penny_subscriptions_by_user.sql'],
];

function loadSqlFiles(): SqlMap {
  const result: SqlMap = {};
  for (const [key, file] of SQL_FILES) {
    result[key] = readSqlFile(`features/penny/sql/${file}`);
  }
  return result;
}

const SQL = loadSqlFiles();

interface PennyDealRow {
  id: number | string;
  sku: string;
  retailer: string;
  store_id: string;
  zip: string;
  title: string;
  price: number | string;
  distance_miles: number | string | null;
  last_seen_at: string | Date;
  metadata: Record<string, unknown> | null;
}

interface PennySubscriptionRow {
  id: string;
  user_id: string;
  zip: string;
  retailer: string | null;
  keyword: string | null;
  channel_id: string | null;
  guild_id: string | null;
  notify_via_dm: boolean;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

let ensured = false;

async function ensurePennyTables(): Promise<void> {
  if (!ensured) {
    logger.debug('Ensuring penny tables exist');
  }
  await pool.query(SQL.ensureDeals);
  await pool.query(SQL.ensureSubs);
  ensured = true;
}

export async function ensurePennyInfrastructure(): Promise<void> {
  await ensurePennyTables();
}

function mapDeal(row: PennyDealRow): PennyDeal {
  return {
    id: Number(row.id),
    sku: row.sku,
    retailer: row.retailer as PennyDeal['retailer'],
    storeId: row.store_id,
    zip: row.zip,
    title: row.title,
    price: typeof row.price === 'number' ? row.price : Number(row.price),
    distanceMiles:
      row.distance_miles === null || row.distance_miles === undefined
        ? null
        : Number(row.distance_miles),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    metadata: row.metadata,
  };
}

function normalizeRetailer(value: PennySubscriptionInput['retailer']): string {
  return value ?? '';
}

function normalizeKeyword(value: PennySubscriptionInput['keyword']): string {
  return value ?? '';
}

function mapSubscription(row: PennySubscriptionRow): PennySubscription {
  return {
    id: row.id,
    userId: row.user_id,
    retailer: row.retailer ? (row.retailer as PennyRetailer) : undefined,
    keyword: row.keyword ?? undefined,
    channelId: row.channel_id ?? undefined,
    guildId: row.guild_id ?? undefined,
    notifyViaDm: Boolean(row.notify_via_dm),
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    zip: row.zip ?? '',
  };
}

export async function upsertPennyDeal(deal: PennyDealUpsert): Promise<PennyDeal> {
  await ensurePennyTables();
  const result = await pool.query<PennyDealRow>(SQL.upsertDeal, [
    deal.sku,
    deal.retailer,
    deal.storeId,
    deal.zip,
    deal.title,
    deal.price,
    deal.distanceMiles ?? null,
    deal.lastSeenAt,
    deal.metadata ?? null,
  ]);
  const row = result.rows[0];
  if (!row) throw new Error('Failed to upsert penny deal');
  return mapDeal(row);
}

export async function fetchRecentPennyDeals(
  zip: string,
  retailer?: string | null,
  limit = 20,
): Promise<PennyDeal[]> {
  await ensurePennyTables();
  const result = await pool.query<PennyDealRow>(SQL.recentDeals, [zip, retailer ?? null, limit]);
  return result.rows.map((row) => mapDeal(row));
}

interface UpsertSubscriptionArgs extends PennySubscriptionInput {
  id?: string | null;
  notifyViaDm?: boolean;
  isActive?: boolean;
}

export async function upsertPennySubscription(
  input: UpsertSubscriptionArgs,
): Promise<PennySubscription> {
  await ensurePennyTables();
  const params = [
    input.id ?? null,
    input.userId,
    input.zip,
    normalizeRetailer(input.retailer),
    normalizeKeyword(input.keyword),
    input.channelId ?? '',
    input.guildId ?? '',
    input.notifyViaDm ?? false,
    input.isActive ?? true,
  ];
  const result = await pool.query<PennySubscriptionRow>(SQL.upsertSub, params);
  const row = result.rows[0];
  if (!row) throw new Error('Failed to upsert penny subscription');
  return mapSubscription(row);
}

export async function listPennySubscriptionsForUser(
  userId: string,
  includeInactive = false,
): Promise<PennySubscription[]> {
  await ensurePennyTables();
  const result = await pool.query<PennySubscriptionRow>(SQL.subsByUser, [userId, includeInactive]);
  return result.rows.map((row) => mapSubscription(row));
}

export async function deactivatePennySubscription(
  id: string,
  userId: string,
): Promise<PennySubscription | null> {
  await ensurePennyTables();
  const result = await pool.query<PennySubscriptionRow>(SQL.deleteSub, [id, userId]);
  const row = result.rows[0];
  return row ? mapSubscription(row) : null;
}
