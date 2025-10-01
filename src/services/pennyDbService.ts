import fs from 'node:fs';

import pg from 'pg';

import { logger } from '../logger.js';
import type {
  PennyDeal,
  PennyDealUpsert,
  PennySubscription,
  PennySubscriptionInput,
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

function loadSqlFiles(): SqlMap {
  const entries: Array<[string, string]> = [
    ['ensureDeals', 'penny_deals_ensure.sql'],
    ['upsertDeal', 'penny_deals_upsert.sql'],
    ['recentDeals', 'penny_deals_recent.sql'],
    ['ensureSubs', 'penny_subscriptions_ensure.sql'],
    ['upsertSub', 'penny_subscriptions_upsert.sql'],
    ['deleteSub', 'penny_subscriptions_delete.sql'],
    ['subsByUser', 'penny_subscriptions_by_user.sql'],
  ];

  return entries.reduce<SqlMap>((acc, [key, file]) => {
    const url = new URL(`../sql/${file}`, import.meta.url);
    acc[key] = fs.readFileSync(url, 'utf-8');
    return acc;
  }, {});
}

const SQL = loadSqlFiles();

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

function mapDeal(row: Record<string, unknown>): PennyDeal {
  return {
    id: Number(row.id),
    sku: String(row.sku),
    retailer: row.retailer as PennyDeal['retailer'],
    storeId: String(row.store_id),
    zip: String(row.zip),
    title: String(row.title),
    price: typeof row.price === 'number' ? row.price : Number(row.price),
    distanceMiles:
      row.distance_miles === null || row.distance_miles === undefined
        ? null
        : Number(row.distance_miles),
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

function normalizeRetailer(value: PennySubscriptionInput['retailer']): string {
  return value ?? '';
}

function normalizeKeyword(value: PennySubscriptionInput['keyword']): string {
  return value ?? '';
}

function mapSubscription(row: Record<string, unknown>): PennySubscription {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    zip: String(row.zip),
    retailer: (row.retailer as string) || undefined,
    keyword: (row.keyword as string) || undefined,
    channelId: (row.channel_id as string) || undefined,
    guildId: (row.guild_id as string) || undefined,
    notifyViaDm: Boolean(row.notify_via_dm),
    isActive: Boolean(row.is_active),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function upsertPennyDeal(deal: PennyDealUpsert): Promise<PennyDeal> {
  await ensurePennyTables();
  const result = await pool.query(SQL.upsertDeal, [
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
  const result = await pool.query(SQL.recentDeals, [zip, retailer ?? null, limit]);
  return result.rows.map(mapDeal);
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
  const result = await pool.query(SQL.upsertSub, params);
  const row = result.rows[0];
  if (!row) throw new Error('Failed to upsert penny subscription');
  return mapSubscription(row);
}

export async function listPennySubscriptionsForUser(
  userId: string,
  includeInactive = false,
): Promise<PennySubscription[]> {
  await ensurePennyTables();
  const result = await pool.query(SQL.subsByUser, [userId, includeInactive]);
  return result.rows.map(mapSubscription);
}

export async function deactivatePennySubscription(
  id: string,
  userId: string,
): Promise<PennySubscription | null> {
  await ensurePennyTables();
  const result = await pool.query(SQL.deleteSub, [id, userId]);
  const row = result.rows[0];
  return row ? mapSubscription(row) : null;
}
